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
// there is no bill to set up. The limits are per-minute and per-day on a
// handful of requests each; a director reviewing catches as they come in will
// not go near them.
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
//   GET  -> { ready, reason }   health check the page runs on startup
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

// Being listed is not the same as being callable - that is the whole bug this
// went through. So a candidate is tried before it is trusted, with a request
// small enough to be free in every way that matters.
//
// Only a 404 disqualifies. A 400 or a 429 means the model is there and
// something else is wrong, and walking past it would land us on a worse one.
async function modelAnswers(key, id) {
  try {
    const res = await fetch(API_ROOT + '/models/' + encodeURIComponent(id) + ':generateContent', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'ok' }] }],
        generationConfig: { maxOutputTokens: 16 }
      })
    });
    return res.status !== 404;
  } catch (e) {
    return false;
  }
}

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
// 400, 401, 403 and 429 are NOT retryable: a bad request, a bad key, or a
// quota is the same on every model, and walking the list would turn one clear
// error into five slow ones.
function isRetryableModelStatus(status) {
  return status === 404 || status === 500 || status === 503;
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

// Returns the model id to call, or throws with something the director can act
// on. `force` skips the cache, for the retry after a 404.
async function resolveModel(key, force) {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;
  if (cachedModel && !force) return cachedModel;

  const ranked = await resolveRanked(key, force);
  // Only the first few are worth trying. Past that the ranking has run out of
  // anything preferable and the director is waiting on a page load.
  for (const id of ranked.slice(0, 5)) {
    if (await modelAnswers(key, id)) {
      cachedModel = id;
      return id;
    }
  }
  const err = new Error('None of the Gemini models this key offers would answer a call.');
  err.noModel = true;
  throw err;
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
      return send(res, 200, { ready: true, model, pinned: !!MODEL_OVERRIDE });
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

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return send(res, 429, { error: 'Too many checks at once. Wait a moment, then try again.' });
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

    for (const id of order.slice(0, 3)) {
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
      return send(res, 429, { error: 'The free Gemini quota is used up for now. Wait a minute, then try again.' });
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
module.exports.__test = { allowedPhotoUrl, clean, normalize, buildPrompt, pickModel, rankModels, isRetryableModelStatus };
