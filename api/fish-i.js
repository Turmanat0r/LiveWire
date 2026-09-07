// Fish-I vision pass - the server half.
//
// WHY THIS FILE EXISTS
// index.html ships to every angler's phone, so it can never hold an API key.
// Opened inside the Claude viewer the page asks Claude directly and this file
// goes unused. Hosted anywhere else - Vercel, in our case - there is no Claude
// in the page to ask, which is why the director was seeing "this copy of the
// page is not running inside the Claude viewer". This endpoint is the other way
// in: the phone talks only to this, and the key stays here in an environment
// variable that never leaves the server.
//
// WHICH MODEL
// Google's Gemini, because its free tier covers a tournament comfortably and
// there is no bill to set up.
//
// WHAT COSTS QUOTA
// Only generateContent. ListModels does not, which is what makes the health
// check below free to answer. That distinction used to be missed here: the
// health check verified each candidate model by GENERATING with it, up to five
// calls, and it ran on every cold serverless instance. The page asked for it on
// load - every angler's page, not just the director's - so a field refreshing
// at the ramp could spend the day's whole free allowance before a single catch
// was reviewed. Nothing on the GET path generates any more, and the page does
// not ask until a director opens the panel.
//
// SETUP - once, and it is the only step
//   1. aistudio.google.com/apikey -> Create API key. No card, no billing.
//   2. Vercel -> your project -> Settings -> Environment Variables
//        Name:  GEMINI_API_KEY
//        Value: the key from step 1
//   3. Save, then redeploy (env vars only reach a build at build time).
//
// Without that key this reports itself unconfigured and the director sees
// Fish-I listed as unavailable, which is exactly where the app already was.
// The local first-pass checks - resolution, blur, duplicate photos, boundary,
// plausible length - never went through here and keep working either way.
//
// WHO MAY ASK
// The director, and nobody else. This endpoint used to take anybody's word for
// it - there was no check at all, and the path ships inside index.html to every
// phone in the field. The prompt is built here and never accepted from the
// page, so it could not be turned into a general-purpose Gemini proxy, but it
// could very cheaply be used to spend the day's free quota and leave Fish-I
// dead in the middle of an event with nothing in the logs to explain it.
//
// So every request now carries the caller's Supabase session and the claim is
// verified against Supabase itself. `app_metadata.director` is the only place
// it is read from: user_metadata would be worthless, because a client can write
// its own and anyone could simply declare themselves the director.
//
// NOTE: this means the DIRECTOR PASSCODE is not enough. The passcode opens the
// panel; it does not create a session, and there is nothing for this to check.
// Sign in as the director to use the vision pass - the same thing already true
// of every write, since the ownership policies went in.
//
//   GET  -> { ready, reason }   health check the director's panel runs
//   POST -> the review object   { species, speciesConfidence, concerns, ... }

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

// Model names move around, and which ones a given key may actually CALL varies
// with the tier it is on - a name can exist, answer a metadata lookup, and
// still 404 on generateContent. So nothing is hardcoded: the server asks the
// key what it can use and picks from that.
//
// Set FISHI_MODEL to pin one by hand; it is then used verbatim and no
// discovery happens.
const MODEL_OVERRIDE = process.env.FISHI_MODEL || '';

// Models that answer generateContent but cannot help here - they generate
// images or music, speak, embed, research, or drive a computer - and would
// fail in ways that read as "Fish-I is broken".
const MODEL_EXCLUDE = /embedding|aqa|imagen|veo|tts|audio|live|-image|image-generation|computer-use|robotics|banana|lyria|research/i;

// Ranked rather than matched against a list of names. A hardcoded preference
// list is a list that goes stale: the first version of this preferred
// gemini-2.5-flash, which by then was listed but no longer callable, so Fish-I
// reported itself ready and failed on the first catch.
//
// Sorts ascending, so smaller is better:
//   1. stable before preview or experimental
//   2. flash, then flash-lite, then pro - flash is the free tier, and quick,
//      which matters when the director is working through a stack
//   3. newest version first
//   4. a pinned release before a -latest alias, which can move underneath us
function modelRank(id) {
  const preview = /preview|experimental|\bexp\b|-exp-/.test(id) ? 1 : 0;
  const kind = /flash-lite/.test(id) ? 1 : /flash/.test(id) ? 0 : /pro/.test(id) ? 2 : 3;
  const v = /^gemini-(\d+(?:\.\d+)?)-/.exec(id);
  const version = v ? parseFloat(v[1]) : 0;
  const latest = /-latest$/.test(id) ? 1 : 0;
  return [preview, kind, -version, latest, id];
}

function rankModels(models) {
  return (models || [])
    .filter(m => m && typeof m.name === 'string')
    .filter(m => Array.isArray(m.supportedGenerationMethods)
              && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .filter(id => /^gemini-/.test(id) && !MODEL_EXCLUDE.test(id))
    .sort((a, b) => {
      const ra = modelRank(a), rb = modelRank(b);
      for (let i = 0; i < ra.length; i++) {
        if (ra[i] < rb[i]) return -1;
        if (ra[i] > rb[i]) return 1;
      }
      return 0;
    });
}

// Kept so the shape of "what would you choose" stays testable on its own.
function pickModel(models) {
  const ranked = rankModels(models);
  return ranked.length ? ranked[0] : null;
}

// Resolved once per warm instance, and only after a model has actually
// answered a call.
let cachedModel = null;

async function listModels(key) {
  const res = await fetch(API_ROOT + '/models?pageSize=200', {
    headers: { 'x-goog-api-key': key }
  });
  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(googleMessage(raw) || ('Gemini returned ' + res.status));
    err.status = res.status;
    throw err;
  }
  try { return (JSON.parse(raw).models) || []; } catch (e) { return []; }
}

let cachedRanked = null;

// A status worth trying the next model for. 404 is the model not being
// callable; 500 and 503 are the flagship being busy, which it will be, because
// everybody wants the newest one. None of these are a reason to give up while
// four other models sit unused.
//
// 429 is on this list too, and that is a correction to what this file used to
// say. Gemini's free-tier quotas are PER MODEL, not per key: running
// gemini-2.5-flash out of its daily requests says nothing whatever about
// gemini-2.5-flash-lite, which has its own allowance, and a larger one.
// Treating one model's spent quota as the whole key's is what turns "the model
// I like is busy" into "Fish-I is down for the rest of the day" with four
// untouched models sitting right there.
//
// 400, 401 and 403 are still NOT retryable: a bad request or a bad key is the
// same on every model, and walking the list would turn one clear error into
// five slow ones.
function isRetryableModelStatus(status) {
  return status === 404 || status === 429 || status === 500 || status === 503;
}

async function resolveRanked(key, force) {
  if (MODEL_OVERRIDE) return [MODEL_OVERRIDE];
  if (cachedRanked && !force) return cachedRanked;
  const ranked = rankModels(await listModels(key));
  if (!ranked.length) {
    const err = new Error('This API key has no vision-capable Gemini model available to it.');
    err.noModel = true;
    throw err;
  }
  cachedRanked = ranked;
  return ranked;
}

// Which model the health check reports, without calling it.
//
// It used to prove the choice by generating with each candidate until one
// answered, because being listed is not the same as being callable - a name can
// exist, answer a metadata lookup, and still 404 on generateContent. That was
// true, and the fix was in the wrong place: proving it cost up to five real
// requests out of a daily allowance of a few hundred, every time a cold
// instance answered "are you ready".
//
// The POST path already walks the ranking when a model refuses, so a top choice
// that 404s costs one wasted round trip and the review still happens. That is
// where the uncertainty belongs - on the one request that had to be made
// anyway, not on a status line.
async function resolveModel(key, force) {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;
  if (cachedModel && !force) return cachedModel;
  const ranked = await resolveRanked(key, force);
  return ranked[0];
}

// Vercel caps a serverless request body at 4.5 MB. The app encodes catch
// photos to 600 KB at the absolute most (PHOTO_STEPS in index.html), so this
// is headroom rather than a limit any real catch will meet.
const MAX_PHOTO_CHARS = 4000000;
const MAX_FETCHED_BYTES = 6000000;

// Counted per warm instance, so this is a speed bump and not a wall. It is
// still the difference between someone quietly burning the free quota and the
// director finding Fish-I rate-limited in the middle of an event.
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60 * 1000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);
  if (hits.size > 500) hits.clear();   // this is one tournament, not a service
  return seen.length > RATE_MAX;
}

// ---- who is asking ----
// Both of these are needed to ask Supabase about a token. Neither is a secret:
// the anon key already ships in index.html to every phone. They are separate
// from GEMINI_API_KEY, which IS one.
const AUTH_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const AUTH_KEY = process.env.SUPABASE_ANON_KEY || '';

function authConfigured() {
  return !!(AUTH_URL && AUTH_KEY);
}

function bearerFrom(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer[ \t]+(.+)$/i.exec(String(h).trim());
  return m ? m[1].trim() : '';
}

// Whether this token belongs to the director. Returns a reason rather than a
// bare false, because "you are not signed in", "your session expired" and "you
// are signed in but not as the director" send somebody three different places.
async function directorFromToken(token) {
  // Refuse by construction, not by accident. With no project configured the
  // fetch below would be handed a relative URL and throw, which happens to end
  // in a refusal - but "it fails closed because the URL was malformed" is not
  // a guarantee, it is a coincidence that a future tidy-up would remove.
  if (!authConfigured()) return { ok: false, reason: 'no-auth-config' };
  if (!token) return { ok: false, reason: 'no-token' };
  // index.html falls back to the anon key when there is no session. That is a
  // key, not a session; Supabase answers 401 for it either way, but refusing it
  // here means an accident can never become a bypass.
  if (token === AUTH_KEY) return { ok: false, reason: 'anon-key' };

  let res;
  try {
    res = await fetch(AUTH_URL + '/auth/v1/user', {
      headers: { apikey: AUTH_KEY, authorization: 'Bearer ' + token }
    });
  } catch (e) {
    return { ok: false, reason: 'auth-unreachable' };
  }
  if (!res.ok) {
    return { ok: false, reason: res.status === 401 ? 'bad-token' : 'auth-http:' + res.status };
  }
  let user;
  try { user = await res.json(); } catch (e) { return { ok: false, reason: 'auth-unreadable' }; }
  return directorClaim(user)
    ? { ok: true, reason: 'director' }
    : { ok: false, reason: 'not-director' };
}

// Kept separate so the claim reading stays testable without a network.
function directorClaim(user) {
  const meta = (user && user.app_metadata) || {};
  return meta.director === true || meta.director === 'true';
}

// What to say when the check refuses. Each of these has a different fix, and
// collapsing them into "unauthorized" is how a five-minute problem becomes an
// afternoon.
const AUTH_REFUSALS = {
  'no-token': 'Fish-I is for the director. This request carried no session - sign in as the director and try again.',
  'anon-key': 'Fish-I is for the director. This request carried the public key rather than a signed-in session.',
  'bad-token': 'That session is not valid any more. Sign in as the director again.',
  'not-director': 'That account is signed in but is not a director. Set {"director": true} on its app_metadata in Supabase, then sign in again.',
  'auth-unreachable': 'Could not reach Supabase to check who is asking. Try again in a moment.',
  'auth-unreadable': 'Supabase gave an unreadable answer when asked who is asking.',
  'no-auth-config': 'Fish-I cannot check who is asking: SUPABASE_URL and SUPABASE_ANON_KEY are not set on the server.'
};

function refusalText(reason) {
  return AUTH_REFUSALS[reason] ||
    'Could not confirm this request came from the director (' + reason + ').';
}

// Anything the client sends ends up inside a prompt, so it is clamped to
// something short and printable first. The prompt itself is assembled HERE and
// is never accepted from the page - otherwise this endpoint would be an open
// Gemini proxy wearing a fish costume.
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[^\w \-'().,/]/g, '').trim().slice(0, max);
}

// Mirrors fishiPrompt() in index.html. The two are deliberately the same words
// so a catch reviewed through the Claude viewer and one reviewed through here
// get judged by the same standard.
function buildPrompt(target, water, claimedSpecies, claimedLength, scoring) {
  const low = target.toLowerCase();
  const claimLine = scoring
    ? 'The angler entered this as a ' + target.toUpperCase() + ' (the scoring species), ' +
      claimedLength + ' inches. Set matchesClaim true only if this really looks like a ' + low + '.'
    : 'The angler entered this as OTHER, meaning they are declaring it is NOT a ' + low + ' ' +
      'and it will not be scored. Name the species you actually see. Set matchesClaim true if ' +
      'the fish is indeed something other than a ' + low + ', and false if it does look like a ' +
      low + ' that was filed as Other.';

  return (
    'You are reviewing a catch photo for a catch-photo-release kayak ' + low +
    ' tournament on ' + water + '. You are a FIRST PASS for a human tournament ' +
    'director. You never decide whether a catch counts; you surface what the director ' +
    'should look at.\n\n' +
    'Judge only these:\n' +
    '1. Species. Say which species you see, and say plainly when the photo does not let ' +
    'you tell it apart from species it closely resembles. Only ' + low +
    ' score in this event.\n' +
    '2. Whether the photo works as evidence: is a bump board with a readable scale in ' +
    'frame, is the fish flat along it rather than curled or lifted, is the nose against ' +
    'the zero stop, is the tail and the scale beneath it fully visible, and is a hand ' +
    'covering the nose, the tail or the markings.\n' +
    '3. Integrity concerns: signs of editing, a photo of a screen, or a reused or staged image.\n\n' +
    'HARD RULE: do NOT estimate, infer or state the length of the fish, and do not say ' +
    'whether the claimed length looks right. Perspective and lens distortion make that ' +
    'unreliable and the director reads the board. If framing prevents a fair reading, ' +
    'put that in concerns instead.\n\n' +
    'Be conservative. Raise a concern only if a reasonable director would want a second ' +
    'look; an ordinary well-shot photo returns an empty concerns array.\n\n' +
    claimLine + '\n\n' +
    'notes is one short sentence. concerns is a list of short specific concerns, empty ' +
    'when there are none.'
  );
}

// Pins the shape of the reply, so the director's screen cannot be handed a
// string where it expects a boolean. This is why there is no JSON to salvage
// out of prose further down - the model is not free to write any.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    species:           { type: 'STRING' },
    speciesConfidence: { type: 'NUMBER' },
    matchesClaim:      { type: 'BOOLEAN' },
    boardVisible:      { type: 'BOOLEAN' },
    fishFlat:          { type: 'BOOLEAN' },
    noseAtStop:        { type: 'BOOLEAN' },
    tailInFrame:       { type: 'BOOLEAN' },
    handBlocking:      { type: 'BOOLEAN' },
    concerns:          { type: 'ARRAY', items: { type: 'STRING' } },
    notes:             { type: 'STRING' }
  },
  required: ['species', 'speciesConfidence', 'matchesClaim', 'boardVisible',
             'fishFlat', 'noseAtStop', 'tailInFrame', 'handBlocking', 'concerns', 'notes']
};

// Only this project's own photo bucket. Gemini needs the bytes rather than a
// link, so this server has to do the fetching - and a server that fetches
// whatever URL it is handed will happily fetch addresses only it can reach.
// The allowlist is what keeps that from being a way in.
function allowedPhotoUrl(u) {
  let parsed;
  try { parsed = new URL(u); } catch (e) { return false; }
  if (parsed.protocol !== 'https:') return false;
  const base = process.env.SUPABASE_URL;
  if (base) {
    let expect;
    try { expect = new URL(base).hostname; } catch (e) { expect = ''; }
    if (expect && parsed.hostname !== expect) return false;
  } else if (!/^[a-z0-9-]+\.supabase\.co$/.test(parsed.hostname)) {
    return false;
  }
  return parsed.pathname.startsWith('/storage/v1/object/public/');
}

// A stored photo is a data: URL while it is still on the angler's phone and an
// https: URL once it has reached Supabase storage. Both have to end up as
// base64 bytes, because inline_data is the only image input that takes a photo
// the Files API has never seen.
async function inlineImage(photo) {
  const p = String(photo || '');
  const m = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(p);
  if (m) {
    return {
      mime_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1],
      data: m[2].replace(/\s+/g, '')
    };
  }
  if (!allowedPhotoUrl(p)) return null;

  const res = await fetch(p);
  if (!res.ok) throw new Error('Could not fetch the catch photo (' + res.status + ')');
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) {
    throw new Error('The stored photo is not an image Fish-I can read.');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_FETCHED_BYTES) throw new Error('That photo is too large to send.');
  return { mime_type: type, data: buf.toString('base64') };
}

// Keep only the fields the director's screen renders, in the types it expects.
// The schema above should already guarantee this; belt and braces, because a
// string where a boolean belongs would make a failed check read as passed.
function normalize(raw) {
  const bool = v => (v === true ? true : v === false ? false : undefined);
  const out = {};
  if (raw.species != null) out.species = String(raw.species).slice(0, 60);
  if (typeof raw.speciesConfidence === 'number') {
    out.speciesConfidence = Math.max(0, Math.min(1, raw.speciesConfidence));
  }
  for (const k of ['matchesClaim', 'boardVisible', 'fishFlat', 'noseAtStop', 'tailInFrame', 'handBlocking']) {
    const v = bool(raw[k]);
    if (v !== undefined) out[k] = v;
  }
  out.concerns = Array.isArray(raw.concerns)
    ? raw.concerns.slice(0, 8).map(c => String(c).slice(0, 200)).filter(Boolean)
    : [];
  if (raw.notes != null) out.notes = String(raw.notes).slice(0, 400);
  return out;
}

function send(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

function googleMessage(raw) {
  try { return (JSON.parse(raw).error || {}).message || ''; } catch (e) { return ''; }
}

// Google puts "try again in N seconds" in the error details on a 429. Passing
// it through is the difference between a director waiting the right minute and
// a director hammering the button, which is the one thing that makes a rate
// limit worse.
function googleRetrySeconds(raw) {
  try {
    const details = ((JSON.parse(raw).error || {}).details) || [];
    for (const d of details) {
      const m = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(String((d && d.retryDelay) || ''));
      if (m) return Math.ceil(parseFloat(m[1]));
    }
  } catch (e) {}
  return 0;
}

// Per-day and per-minute limits are both a 429 and they do NOT have the same
// answer: one clears in a minute, the other at midnight Pacific. Telling a
// director to "wait a moment" when the day's allowance is gone has them
// pressing the button for an hour.
function isDailyQuota(raw) {
  try {
    const err = JSON.parse(raw).error || {};
    const blob = JSON.stringify(err.details || []) + ' ' + (err.message || '');
    return /PerDay|per day|\bdaily\b/i.test(blob);
  } catch (e) {
    return false;
  }
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;

  // Health check. The page calls this on startup so the director is told why
  // Fish-I is unavailable instead of finding out by pressing the button.
  //
  // It confirms the MODEL NAME too. Model names get retired, and the failure
  // that causes is a 404 in the middle of judging a catch - which reads as
  // "Fish-I is broken" rather than "that model no longer exists".
  if (req.method === 'GET') {
    if (!key) return send(res, 200, { ready: false, reason: 'no-api-key' });
    // Refusing every request is the right answer to "I cannot tell who is
    // asking", but it must not be a SILENT one - so the health check names the
    // two variables rather than leaving the director to guess.
    if (!authConfigured()) return send(res, 200, { ready: false, reason: 'no-auth-config' });
    // The panel asks this to find out why Fish-I is unavailable, so the check
    // runs here too - otherwise a director whose session had expired would be
    // told the feature was ready and find out by pressing the button.
    const who = await directorFromToken(bearerFrom(req));
    if (!who.ok) return send(res, 200, { ready: false, reason: 'not-director', detail: refusalText(who.reason) });
    try {
      // ?models=1 lists what this key was actually offered. No secret is in
      // it, and when a model is refused despite being listed it is the only
      // way to see the difference between the two from outside.
      if (req.query && req.query.models === '1') {
        const all = await listModels(key);
        return send(res, 200, {
          chose: pickModel(all),
          ranked: rankModels(all).slice(0, 5),
          offered: all
            .filter(m => m && Array.isArray(m.supportedGenerationMethods))
            .map(m => m.name.replace(/^models\//, '') +
                      ' [' + m.supportedGenerationMethods.join(',') + ']')
        });
      }
      const model = await resolveModel(key, req.query && req.query.refresh === '1');
      // `verified` is false until a model has actually answered a review. The
      // page does not need it to be true - it needs to know a key is present
      // and this key has vision-capable models, which is what this says.
      return send(res, 200, {
        ready: true, model, pinned: !!MODEL_OVERRIDE, verified: cachedModel === model
      });
    } catch (e) {
      if (e && (e.status === 400 || e.status === 401 || e.status === 403)) {
        return send(res, 200, { ready: false, reason: 'bad-key', detail: e.message });
      }
      if (e && e.noModel) {
        return send(res, 200, { ready: false, reason: 'bad-model', detail: e.message });
      }
      return send(res, 200, { ready: false, reason: 'unreachable' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Use POST.' });
  }
  if (!key) {
    return send(res, 503, {
      error: 'Fish-I is not configured on the server: GEMINI_API_KEY is not set.'
    });
  }

  // Rate limit BEFORE the auth check. The limit is in-memory and free; the
  // auth check is a round trip to Supabase, and an endpoint that makes one of
  // those for every unauthenticated request is its own kind of open door.
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return send(res, 429, { error: 'Too many checks at once. Wait a moment, then try again.' });
  }

  // Fail CLOSED. An authorization control that quietly passes everything when
  // it is misconfigured is worse than none, because it reads as protection.
  if (!authConfigured()) {
    return send(res, 503, {
      error: 'Fish-I cannot check who is asking, so it is refusing every request. ' +
        'Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel and redeploy. Neither is ' +
        'a secret - the anon key already ships in the page.'
    });
  }
  const who = await directorFromToken(bearerFrom(req));
  if (!who.ok) {
    // 403 for "you are not the director", 401 for "you are nobody yet", so the
    // page can tell a missing session from a wrong one.
    const status = (who.reason === 'no-token' || who.reason === 'anon-key' ||
                    who.reason === 'bad-token') ? 401 : 403;
    return send(res, status, { error: refusalText(who.reason) });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return send(res, 400, { error: 'Expected a JSON body.' });
  }

  const photo = String(body.photo || '');
  if (!photo) return send(res, 400, { error: 'No photo is stored with this catch.' });
  if (photo.length > MAX_PHOTO_CHARS) {
    return send(res, 413, { error: 'That photo is too large to send.' });
  }

  let image;
  try {
    image = await inlineImage(photo);
  } catch (e) {
    return send(res, 502, { error: e && e.message ? e.message : 'Could not read the catch photo.' });
  }
  if (!image) {
    return send(res, 400, { error: 'That photo is not in a format Fish-I can read.' });
  }

  const target = clean(body.targetSpecies, 40) || 'Walleye';
  const water = clean(body.water, 80) || 'the tournament water';
  const claimedSpecies = clean(body.claimedSpecies, 40) || target;
  const claimedLength = clean(body.claimedLength, 12) || 'an unstated';
  const scoring = body.scoring !== false;
  const prompt = buildPrompt(target, water, claimedSpecies, claimedLength, scoring);

  const payload = JSON.stringify({
    contents: [{
      role: 'user',
      parts: [{ inline_data: image }, { text: prompt }]
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA
    }
  });

  const callModel = (model) => fetch(
    API_ROOT + '/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: payload
    }
  );

  let model, upstream;
  try {
    // Whichever model was verified goes first; the rest of the ranking is the
    // queue behind it. A catch is judged by whichever answers, and they are
    // ranked by preference, so falling down the list costs a little quality
    // rather than the whole review.
    const ranked = await resolveRanked(key, false);
    const order = cachedModel
      ? [cachedModel].concat(ranked.filter(id => id !== cachedModel))
      : ranked;

    // Five rather than three, because nothing has been pre-verified any more:
    // the health check no longer spends quota proving a model callable, so this
    // loop is the only thing standing between a retired top choice and a failed
    // review. A 404 comes back fast; a spent quota comes back faster.
    for (const id of order.slice(0, 5)) {
      model = id;
      upstream = await callModel(id);
      if (!isRetryableModelStatus(upstream.status)) break;
      // Whatever was cached is not answering; stop preferring it.
      if (cachedModel === id) cachedModel = null;
    }
  } catch (e) {
    if (e && e.noModel) return send(res, 502, { error: e.message });
    return send(res, 502, { error: 'Could not reach Gemini: ' + (e && e.message ? e.message : 'network error') });
  }
  if (upstream && upstream.ok) cachedModel = model;

  const raw = await upstream.text();
  if (!upstream.ok) {
    const detail = googleMessage(raw);
    if (upstream.status === 401 || upstream.status === 403) {
      return send(res, 502, { error: 'The server\'s Gemini API key was rejected. Check GEMINI_API_KEY in Vercel.' });
    }
    if (upstream.status === 429) {
      // Every model in the ranking was tried by the time we get here, so this
      // really is the whole key and not one busy model.
      const wait = googleRetrySeconds(raw);
      return send(res, 429, {
        error: isDailyQuota(raw)
          ? 'Every Gemini model on this key has used up its free requests for today. ' +
            'The allowance resets at midnight Pacific. The first-pass checks - ' +
            'resolution, blur, duplicate photos, boundary, plausible length - are ' +
            'all local and still running, so catches can still be judged.'
          : 'Gemini is rate limited right now' + (wait
              ? ' \u2014 try again in about ' + wait + ' second' + (wait === 1 ? '' : 's') + '.'
              : '. Wait a minute, then try again.')
      });
    }
    if (upstream.status === 503 || upstream.status === 500) {
      return send(res, 503, {
        error: 'Gemini is busy right now - every model this key offers turned the photo away. This clears on its own; try again in a minute.'
      });
    }
    if (upstream.status === 404) {
      // Google's own words matter here. "Model not found" and "not supported
      // for generateContent" and "API version" are three different problems
      // that all arrive as a 404, and they do not share a fix.
      return send(res, 502, {
        error: (MODEL_OVERRIDE
          ? 'This key cannot use the model "' + model + '" pinned in FISHI_MODEL. Clear that variable to let the server pick one.'
          : 'This key cannot call "' + model + '".') + (detail ? ' Google says: ' + detail : '')
      });
    }
    return send(res, 502, { error: 'Gemini returned ' + upstream.status + (detail ? ': ' + detail : '') });
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    return send(res, 502, { error: 'Gemini returned an unreadable response.' });
  }

  const cand = (data.candidates || [])[0];
  if (!cand) {
    // A prompt blocked outright comes back with no candidate at all, and the
    // reason lives somewhere else entirely.
    const blocked = data.promptFeedback && data.promptFeedback.blockReason;
    return send(res, 502, {
      error: blocked
        ? 'Gemini declined to review this image (' + blocked + '). Review it manually.'
        : 'Gemini returned no answer. Try again.'
    });
  }
  if (cand.finishReason && cand.finishReason !== 'STOP') {
    if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
      return send(res, 502, { error: 'Gemini declined to review this image. Review it manually.' });
    }
    if (cand.finishReason === 'MAX_TOKENS') {
      return send(res, 502, { error: 'Gemini ran out of room mid-answer. Try again.' });
    }
  }

  const text = ((cand.content && cand.content.parts) || [])
    .map(p => p && p.text)
    .filter(Boolean)
    .join('');
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
  if (!parsed || typeof parsed !== 'object') {
    return send(res, 502, { error: 'Fish-I gave an unreadable answer. Try again.' });
  }

  return send(res, 200, normalize(parsed));
};

// Reachable from test/fish-i.test.mjs. Vercel only cares that module.exports
// is the handler, and it still is - these hang off it.
module.exports.__test = { allowedPhotoUrl, clean, normalize, buildPrompt, pickModel,
                          rankModels, isRetryableModelStatus, googleRetrySeconds, isDailyQuota,
                          bearerFrom, directorClaim, refusalText, AUTH_REFUSALS,
                          directorFromToken, authConfigured };
