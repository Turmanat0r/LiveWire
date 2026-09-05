// Fish-I vision pass - the server half.
//
// WHY THIS FILE EXISTS
// index.html ships to every angler's phone, so it can never hold an Anthropic
// API key. Opened inside the Claude viewer the page asks Claude directly and
// this file goes unused. Hosted anywhere else - Vercel, in our case - there is
// no Claude to ask, which is why the director was seeing "this copy of the page
// is not running inside the Claude viewer". This endpoint is the other way in:
// the phone talks only to this, and the key stays here in an environment
// variable that never leaves the server.
//
// SETUP - once, and it is the only step
//   Vercel -> your project -> Settings -> Environment Variables
//     Name:  ANTHROPIC_API_KEY
//     Value: your key from console.anthropic.com
//   Save, then redeploy.
//
// Without that key this reports itself unconfigured and the director sees
// Fish-I listed as unavailable, which is exactly where the app already was.
// The local first-pass checks - resolution, blur, duplicate photos, boundary,
// plausible length - never went through here and keep working either way.
//
//   GET  -> { ready, reason }   health check the page runs on startup
//   POST -> the review object   { species, speciesConfidence, concerns, ... }

const MODEL = process.env.FISHI_MODEL || 'claude-sonnet-5';
const ANTHROPIC_VERSION = '2023-06-01';

// Vercel caps a serverless request body at 4.5 MB. The app encodes catch
// photos to 600 KB at the absolute most (PHOTO_STEPS in index.html), so this
// is headroom rather than a limit any real catch will meet.
const MAX_PHOTO_CHARS = 4000000;

// Counted per warm instance, so this is a speed bump and not a wall. It is
// still the difference between someone burning a few dollars of your key and
// someone burning the whole month of it while you are on the water.
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
// Claude proxy wearing a fish costume.
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
    'Reply with only a JSON object of this shape:\n' +
    '{"species":"' + low + '","speciesConfidence":0.9,"matchesClaim":true,"boardVisible":true,' +
    '"fishFlat":true,"noseAtStop":true,"tailInFrame":true,"handBlocking":false,' +
    '"concerns":["short specific concern"],"notes":"one short sentence"}'
  );
}

// A stored photo is a data: URL while it is still on the angler's phone and an
// https: URL once it has reached Supabase storage. Both have to work.
function imageSource(photo) {
  const p = String(photo || '');
  const m = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(p);
  if (m) {
    return {
      type: 'base64',
      media_type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1],
      data: m[2].replace(/\s+/g, '')
    };
  }
  // Handing the URL to Anthropic rather than fetching it here is deliberate:
  // a fetch on this side is a server that can be talked into requesting any
  // address you can reach, including ones only this server can see.
  if (/^https:\/\/[^\s]+$/.test(p)) return { type: 'url', url: p };
  return null;
}

// The model is asked for JSON, so it usually returns JSON - but "usually" is
// not a contract. The assistant turn is prefilled with "{" so there is nothing
// to strip, and this still trims anything that follows the closing brace.
function parseReview(text) {
  const end = text.lastIndexOf('}');
  if (end === -1) return null;
  try { return JSON.parse(text.slice(0, end + 1)); } catch (e) { return null; }
}

// Keep only the fields the director's screen actually renders, in the types it
// expects. A stray field cannot reach the page, and a string where a boolean
// belongs cannot make a check read as passed.
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
    ? raw.concerns.slice(0, 8).map(c => String(c).slice(0, 200))
    : [];
  if (raw.notes != null) out.notes = String(raw.notes).slice(0, 400);
  return out;
}

function send(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;

  // Health check. The page calls this on startup so the director is told why
  // Fish-I is unavailable instead of finding out by pressing the button.
  if (req.method === 'GET') {
    return send(res, 200, key
      ? { ready: true, model: MODEL }
      : { ready: false, reason: 'no-api-key' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Use POST.' });
  }
  if (!key) {
    return send(res, 503, {
      error: 'Fish-I is not configured on the server: ANTHROPIC_API_KEY is not set.'
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
  const source = imageSource(photo);
  if (!source) {
    return send(res, 400, { error: 'That photo is not in a format Fish-I can read.' });
  }

  const target = clean(body.targetSpecies, 40) || 'Walleye';
  const water = clean(body.water, 80) || 'the tournament water';
  const claimedSpecies = clean(body.claimedSpecies, 40) || target;
  const claimedLength = clean(body.claimedLength, 12) || 'an unstated';
  const scoring = body.scoring !== false;
  const prompt = buildPrompt(target, water, claimedSpecies, claimedLength, scoring);

  let upstream;
  try {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          { role: 'user', content: [{ type: 'image', source }, { type: 'text', text: prompt }] },
          // Prefilling the reply with an open brace is what makes the JSON
          // reliable: there is no prose to strip because the turn is already
          // mid-object.
          { role: 'assistant', content: '{' }
        ]
      })
    });
  } catch (e) {
    return send(res, 502, { error: 'Could not reach Claude: ' + (e && e.message ? e.message : 'network error') });
  }

  const raw = await upstream.text();
  if (!upstream.ok) {
    let detail = '';
    try { detail = (JSON.parse(raw).error || {}).message || ''; } catch (e) {}
    if (upstream.status === 401 || upstream.status === 403) {
      return send(res, 502, { error: 'The server\'s Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel.' });
    }
    if (upstream.status === 429) {
      return send(res, 429, { error: 'Claude is rate limiting this key. Wait a moment, then try again.' });
    }
    return send(res, 502, { error: 'Claude returned ' + upstream.status + (detail ? ': ' + detail : '') });
  }

  let data;
  try { data = JSON.parse(raw); } catch (e) {
    return send(res, 502, { error: 'Claude returned an unreadable response.' });
  }
  if (data.stop_reason === 'refusal') {
    return send(res, 502, { error: 'Claude declined to review this image. Review it manually.' });
  }

  const text = '{' + (data.content || [])
    .filter(b => b && b.type === 'text')
    .map(b => b.text)
    .join('');
  const parsed = parseReview(text);
  if (!parsed) return send(res, 502, { error: 'Fish-I gave an unreadable answer. Try again.' });

  return send(res, 200, normalize(parsed));
};
