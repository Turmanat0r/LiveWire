// Fish-I: an AI look at a catch photo, for the director, on Gemini's free tier.
// Ported from the old app's api/fish-i.js; tests/parity checks the prompt and
// the model choice against it word for word.
//
// The phone sends only a catch's id and the director's session. Everything
// else (species, length, which species score, the water, the photo itself) is
// read here from Supabase under that session, and the prompt is built here.
// Nothing the phone writes reaches the prompt, so this cannot be turned into a
// general-purpose Gemini proxy, and the Gemini key never leaves the server.
//
// WHO MAY ASK: the director, and nobody else. Every request's session is
// checked with Supabase itself, and app_metadata.director is the only place
// the claim is read from: a phone can write its own user_metadata.
//
// WHAT COSTS QUOTA: only generateContent. The health check (GET) lists models,
// which is free, and is asked only when the director opens the review.
//
// SETUP: aistudio.google.com/apikey, Create API key (no card, no billing), then
// in Vercel: Settings, Environment Variables, GEMINI_API_KEY. Redeploy.
// FISHI_MODEL pins one model by name; leave it unset to let this pick.
//
//   GET  -> { ready, reason?, detail?, model? }   the review screen's health check
//   POST { catchId } -> { review, saved }          the look itself, saved on the catch

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta';

const env = (name: string): string => process.env[name] ?? '';
const SUPABASE_URL = (): string => env('VITE_SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_KEY = (): string => env('VITE_SUPABASE_PUBLISHABLE_KEY');

// ---- which model --------------------------------------------------------------
// Model names move around, and which ones a key may CALL varies with its tier,
// so nothing is hardcoded: the key is asked what it can use.

// Models that answer generateContent but cannot help here.
const MODEL_EXCLUDE =
  /embedding|aqa|imagen|veo|tts|audio|live|-image|image-generation|computer-use|robotics|banana|lyria|research/i;

/**
 * Ranked, smaller first: stable before preview; flash, then flash-lite, then
 * pro (flash is the free tier, and quick); newest version first; a pinned
 * release before a -latest alias that can move underneath us.
 */
export function modelRank(id: string): [number, number, number, number, string] {
  const preview = /preview|experimental|\bexp\b|-exp-/.test(id) ? 1 : 0;
  const kind = id.includes('flash-lite')
    ? 1
    : id.includes('flash')
      ? 0
      : id.includes('pro')
        ? 2
        : 3;
  const v = /^gemini-(\d+(?:\.\d+)?)-/.exec(id);
  const version = v?.[1] ? parseFloat(v[1]) : 0;
  const latest = id.endsWith('-latest') ? 1 : 0;
  return [preview, kind, -version, latest, id];
}

interface GeminiModel {
  readonly name?: unknown;
  readonly supportedGenerationMethods?: unknown;
}

export function rankModels(models: readonly GeminiModel[]): string[] {
  return models
    .filter(
      (m) =>
        typeof m.name === 'string' &&
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent'),
    )
    .map((m) => String(m.name).replace(/^models\//, ''))
    .filter((id) => id.startsWith('gemini-') && !MODEL_EXCLUDE.test(id))
    .sort((a, b) => {
      const ra = modelRank(a);
      const rb = modelRank(b);
      for (let i = 0; i < ra.length; i++) {
        const x = ra[i] ?? 0;
        const y = rb[i] ?? 0;
        if (x < y) return -1;
        if (x > y) return 1;
      }
      return 0;
    });
}

export function pickModel(models: readonly GeminiModel[]): string | null {
  return rankModels(models)[0] ?? null;
}

/**
 * Worth trying the next model for: 404 is a model this key cannot call, 500
 * and 503 a busy one, and 429 a spent quota, which is PER MODEL on the free
 * tier. 400, 401 and 403 are the same on every model, so they are not.
 */
export function isRetryableModelStatus(status: number): boolean {
  return status === 404 || status === 429 || status === 500 || status === 503;
}

// Resolved once per warm instance.
let cachedModel: string | null = null;
let cachedRanked: string[] | null = null;

class GeminiError extends Error {
  readonly status: number;
  readonly noModel: boolean;
  constructor(message: string, status: number, noModel = false) {
    super(message);
    this.status = status;
    this.noModel = noModel;
  }
}

async function listModels(key: string): Promise<GeminiModel[]> {
  const res = await fetch(`${API_ROOT}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': key },
  });
  const raw = await res.text();
  if (!res.ok)
    throw new GeminiError(
      googleMessage(raw) || `Gemini returned ${String(res.status)}`,
      res.status,
    );
  try {
    const parsed = JSON.parse(raw) as { models?: GeminiModel[] };
    return parsed.models ?? [];
  } catch {
    return [];
  }
}

async function resolveRanked(key: string, force: boolean): Promise<string[]> {
  const pinned = env('FISHI_MODEL');
  if (pinned) return [pinned];
  if (cachedRanked && !force) return cachedRanked;
  const ranked = rankModels(await listModels(key));
  if (ranked.length === 0) {
    throw new GeminiError(
      'This API key has no vision-capable Gemini model available to it.',
      0,
      true,
    );
  }
  cachedRanked = ranked;
  return ranked;
}

// ---- the prompt -----------------------------------------------------------------

/**
 * Text from whatever came back, as JavaScript's own String() would give it (a
 * model's answer is only nearly always the right type), without leaning on
 * String() for objects.
 */
function asText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) {
    return v.map((x: unknown) => (x === null || x === undefined ? '' : asText(x))).join(',');
  }
  return typeof v === 'object' ? '[object Object]' : '';
}

/** Short and printable: these come from the director's own setup, but they go into a prompt. */
export function clean(v: unknown, max: number): string {
  return asText(v ?? '')
    .replace(/[^\w \-'().,/]/g, '')
    .trim()
    .slice(0, max);
}

function speciesNames(target: string): string[] {
  return target
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function joinOr(parts: readonly string[], fallback: string): string {
  const last = parts.at(-1);
  if (last === undefined) return fallback;
  if (parts.length === 1) return last;
  return `${parts.slice(0, -1).join(', ')} or ${last}`;
}

/** "a walleye" / "a walleye or a northern pike" */
export function speciesPhrase(target: string): string {
  return joinOr(
    speciesNames(target).map((n) => `a ${n}`),
    'a scoring fish',
  );
}

/** "walleye" / "walleye or northern pike" */
export function speciesBare(target: string): string {
  return joinOr(speciesNames(target), 'scoring fish');
}

/**
 * The old app's words, kept exactly, so a catch is judged by the same standard
 * as before. `target` is the scoring species, comma-joined.
 */
export function buildPrompt(
  target: string,
  water: string,
  claimedSpecies: string,
  claimedLength: string,
  scoring: boolean,
): string {
  const low = speciesPhrase(target);
  const bare = speciesBare(target);
  const claimed = claimedSpecies || target;
  const claimLine = scoring
    ? 'The angler entered this as a ' +
      claimed.toUpperCase() +
      ' (a scoring species in this ' +
      'event), ' +
      claimedLength +
      ' inches. Set matchesClaim true only if this really looks ' +
      'like a ' +
      claimed.toLowerCase() +
      '.'
    : 'The angler entered this as OTHER, meaning they are declaring it is NOT ' +
      low +
      ' ' +
      'and it will not be scored. Name the species you actually see. Set matchesClaim true if ' +
      'the fish is indeed none of those, and false if it does look like ' +
      low +
      ' that was filed as Other.';

  return (
    'You are reviewing a catch photo for a catch-photo-release kayak ' +
    bare +
    ' tournament on ' +
    water +
    '. You are a FIRST PASS for a human tournament ' +
    'director. You never decide whether a catch counts; you surface what the director ' +
    'should look at.\n\n' +
    'Judge only these:\n' +
    '1. Species. Say which species you see, and say plainly when the photo does not let ' +
    'you tell it apart from species it closely resembles. Only ' +
    bare +
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
    claimLine +
    '\n\n' +
    'notes is one short sentence. concerns is a list of short specific concerns, empty ' +
    'when there are none.'
  );
}

/** Pins the reply's shape, so the screen is never handed a string where a yes or no belongs. */
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    species: { type: 'STRING' },
    speciesConfidence: { type: 'NUMBER' },
    matchesClaim: { type: 'BOOLEAN' },
    boardVisible: { type: 'BOOLEAN' },
    fishFlat: { type: 'BOOLEAN' },
    noseAtStop: { type: 'BOOLEAN' },
    tailInFrame: { type: 'BOOLEAN' },
    handBlocking: { type: 'BOOLEAN' },
    concerns: { type: 'ARRAY', items: { type: 'STRING' } },
    notes: { type: 'STRING' },
  },
  required: [
    'species',
    'speciesConfidence',
    'matchesClaim',
    'boardVisible',
    'fishFlat',
    'noseAtStop',
    'tailInFrame',
    'handBlocking',
    'concerns',
    'notes',
  ],
} as const;

const CHECKS = [
  'matchesClaim',
  'boardVisible',
  'fishFlat',
  'noseAtStop',
  'tailInFrame',
  'handBlocking',
] as const;

/**
 * Only the fields the director's screen shows, in the types it expects: a
 * string where a yes or no belongs would make a failed check read as passed.
 * src/domain/fishI.ts reads the saved copy back the same way.
 */
export function normalize(raw: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw['species'] !== undefined && raw['species'] !== null) {
    out['species'] = asText(raw['species']).slice(0, 60);
  }
  const confidence = raw['speciesConfidence'];
  if (typeof confidence === 'number')
    out['speciesConfidence'] = Math.max(0, Math.min(1, confidence));
  for (const k of CHECKS) {
    const v = raw[k];
    if (v === true || v === false) out[k] = v;
  }
  const concerns = raw['concerns'];
  out['concerns'] = Array.isArray(concerns)
    ? concerns
        .slice(0, 8)
        .map((c) => asText(c).slice(0, 200))
        .filter(Boolean)
    : [];
  if (raw['notes'] !== undefined && raw['notes'] !== null) {
    out['notes'] = asText(raw['notes']).slice(0, 400);
  }
  return out;
}

// ---- Google's errors ------------------------------------------------------------

export function googleMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    return typeof message === 'string' ? message : '';
  } catch {
    return '';
  }
}

/** Google's "try again in N seconds", so the director waits the right minute. */
export function googleRetrySeconds(raw: string): number {
  try {
    const parsed = JSON.parse(raw) as { error?: { details?: unknown } };
    const details = Array.isArray(parsed.error?.details) ? parsed.error.details : [];
    for (const d of details as unknown[]) {
      const delay =
        typeof d === 'object' && d !== null ? (d as { retryDelay?: unknown }).retryDelay : '';
      const m = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(asText(delay));
      if (m?.[1]) return Math.ceil(parseFloat(m[1]));
    }
  } catch {
    // Not JSON: no hint to pass on.
  }
  return 0;
}

/** A day's allowance spent, rather than a minute's: one clears in a minute, the other at midnight Pacific. */
export function isDailyQuota(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as { error?: { details?: unknown; message?: unknown } };
    const err = parsed.error ?? {};
    const blob = `${JSON.stringify(err.details ?? [])} ${typeof err.message === 'string' ? err.message : ''}`;
    return /PerDay|per day|\bdaily\b/i.test(blob);
  } catch {
    return false;
  }
}

// ---- who is asking ----------------------------------------------------------------

export function directorClaim(user: unknown): boolean {
  if (typeof user !== 'object' || user === null) return false;
  const meta = (user as { app_metadata?: { director?: unknown } }).app_metadata;
  return meta?.director === true || meta?.director === 'true';
}

type Refusal =
  | 'no-token'
  | 'anon-key'
  | 'bad-token'
  | 'not-director'
  | 'auth-unreachable'
  | 'auth-unreadable'
  | 'no-auth-config'
  | 'bad-apikey';

/** Each has a different fix; "unauthorized" for all of them turns five minutes into an afternoon. */
export const REFUSALS: Readonly<Record<Refusal, string>> = {
  'no-token':
    'Fish-I is for the director. This request carried no session: sign in as the director and try again.',
  'anon-key':
    'Fish-I is for the director. This request carried the public key rather than a signed-in session.',
  'bad-token': 'That session is not valid any more. Sign in as the director again.',
  'not-director':
    'That account is signed in but is not a director. Sign in with the director account.',
  'auth-unreachable': 'Could not reach Supabase to check who is asking. Try again in a moment.',
  'auth-unreadable': 'Supabase gave an unreadable answer when asked who is asking.',
  'no-auth-config':
    'Fish-I cannot check who is asking: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set on the server.',
  'bad-apikey':
    'Supabase rejected this server’s own key, so it cannot check who is asking. VITE_SUPABASE_PUBLISHABLE_KEY in Vercel is wrong or belongs to another project. This is not a problem with your sign-in.',
};

export function bearerFrom(request: Request): string {
  const h = request.headers.get('authorization') ?? '';
  const m = /^Bearer[ \t]+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() ?? '';
}

async function director(token: string): Promise<Refusal | null> {
  const base = SUPABASE_URL();
  const key = SUPABASE_KEY();
  if (!base || !key) return 'no-auth-config';
  if (!token) return 'no-token';
  if (token === key) return 'anon-key';
  let res: Response;
  try {
    res = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
    });
  } catch {
    return 'auth-unreachable';
  }
  // The other way round from the obvious guess: 403 is the CALLER's session,
  // 401 the SERVER's own key.
  if (res.status === 403) return 'bad-token';
  if (res.status === 401) return 'bad-apikey';
  if (!res.ok) return 'auth-unreachable';
  let user: unknown;
  try {
    user = await res.json();
  } catch {
    return 'auth-unreadable';
  }
  return directorClaim(user) ? null : 'not-director';
}

// ---- answers ------------------------------------------------------------------------

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// A speed bump per warm instance, not a wall: still the difference between
// someone quietly burning the free quota and Fish-I dead mid-event.
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const seen = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);
  if (hits.size > 500) hits.clear();
  return seen.length > RATE_MAX;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTO_BYTES = 6_000_000;

/** The health check: is there a key, may this session ask, and which model would answer. */
export async function GET(request: Request): Promise<Response> {
  const key = env('GEMINI_API_KEY');
  if (!key) return json(200, { ready: false, reason: 'no-api-key' });
  const refused = await director(bearerFrom(request));
  if (refused) {
    return json(200, {
      ready: false,
      reason: refused === 'no-auth-config' ? 'no-auth-config' : 'not-director',
      detail: REFUSALS[refused],
    });
  }
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('models') === '1') {
      // What this key was offered, for when a listed model still refuses.
      const all = await listModels(key);
      return json(200, { chose: pickModel(all), ranked: rankModels(all).slice(0, 5) });
    }
    const ranked = await resolveRanked(key, url.searchParams.get('refresh') === '1');
    return json(200, { ready: true, model: cachedModel ?? ranked[0] ?? null });
  } catch (e) {
    if (e instanceof GeminiError && [400, 401, 403].includes(e.status)) {
      return json(200, { ready: false, reason: 'bad-key', detail: e.message });
    }
    if (e instanceof GeminiError && e.noModel) {
      return json(200, { ready: false, reason: 'bad-model', detail: e.message });
    }
    return json(200, { ready: false, reason: 'unreachable' });
  }
}

/** The look itself: one catch, by id, judged and saved on the catch. */
export async function POST(request: Request): Promise<Response> {
  const key = env('GEMINI_API_KEY');
  if (!key) {
    return json(503, { error: 'Fish-I is not set up on the server: GEMINI_API_KEY is not set.' });
  }
  // Before the session check: this is free, and that is a round trip to Supabase.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip)) {
    return json(429, { error: 'Too many checks at once. Wait a moment, then try again.' });
  }
  const token = bearerFrom(request);
  const refused = await director(token);
  if (refused) {
    const status =
      refused === 'bad-apikey' || refused === 'no-auth-config'
        ? 503
        : refused === 'no-token' || refused === 'anon-key' || refused === 'bad-token'
          ? 401
          : 403;
    return json(status, { error: REFUSALS[refused] });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const catchId =
    typeof body === 'object' && body !== null ? (body as { catchId?: unknown }).catchId : null;
  if (typeof catchId !== 'string' || !UUID.test(catchId)) {
    return json(400, { error: 'Which catch? Expected { catchId }.' });
  }

  // Everything about the catch, read as the director, from Supabase itself.
  const base = SUPABASE_URL();
  const as = { apikey: SUPABASE_KEY(), authorization: `Bearer ${token}` };
  const read = async <T>(path: string): Promise<T[]> => {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers: as });
    if (!res.ok) throw new Error(`Supabase answered ${String(res.status)}`);
    return (await res.json()) as T[];
  };
  let fish: { event_id: string; species: string; length_inches: number; photo_path: string };
  let species: string[];
  let water: string;
  let image: { mime_type: string; data: string };
  try {
    const [row] = await read<typeof fish>(
      `catches?id=eq.${catchId}&select=event_id,species,length_inches,photo_path`,
    );
    if (!row) return json(404, { error: 'There is no such catch.' });
    fish = row;
    const [event] = await read<{ course_label_long: string }>(
      `events?id=eq.${fish.event_id}&select=course_label_long`,
    );
    water = clean(event?.course_label_long, 80) || 'the tournament water';
    species = (
      await read<{ name: string }>(
        `event_species?event_id=eq.${fish.event_id}&select=name&order=position`,
      )
    ).map((s) => s.name);
    const photo = await fetch(
      `${base}/storage/v1/object/authenticated/catch-photos/${fish.photo_path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
      { headers: as },
    );
    if (!photo.ok)
      return json(502, { error: `Could not fetch the catch photo (${String(photo.status)}).` });
    const type = (photo.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!/^image\/(jpeg|png|webp)$/.test(type)) {
      return json(502, { error: 'The stored photo is not an image Fish-I can read.' });
    }
    const bytes = Buffer.from(await photo.arrayBuffer());
    if (bytes.length > MAX_PHOTO_BYTES)
      return json(413, { error: 'That photo is too large to send.' });
    image = { mime_type: type, data: bytes.toString('base64') };
  } catch (e) {
    return json(502, {
      error: `Could not read the catch: ${e instanceof Error ? e.message : 'network error'}.`,
    });
  }

  const target = clean(species.join(', '), 120) || 'Walleye';
  const scoring = fish.species !== 'Other' && species.includes(fish.species);
  const prompt = buildPrompt(
    target,
    water,
    clean(fish.species, 40) || target,
    clean(String(fish.length_inches), 12) || 'an unstated',
    scoring,
  );
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ inline_data: image }, { text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let model = '';
  let upstream: Response | null = null;
  try {
    const ranked = await resolveRanked(key, false);
    const order = cachedModel
      ? [cachedModel, ...ranked.filter((id) => id !== cachedModel)]
      : ranked;
    // Down the ranking until one answers: a retired or busy model costs one
    // quick round trip rather than the review.
    for (const id of order.slice(0, 5)) {
      model = id;
      upstream = await fetch(`${API_ROOT}/models/${encodeURIComponent(id)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: payload,
      });
      if (!isRetryableModelStatus(upstream.status)) break;
      if (cachedModel === id) cachedModel = null;
    }
  } catch (e) {
    if (e instanceof GeminiError && e.noModel) return json(502, { error: e.message });
    return json(502, {
      error: `Could not reach Gemini: ${e instanceof Error ? e.message : 'network error'}.`,
    });
  }
  if (!upstream) return json(502, { error: 'Gemini returned no answer. Try again.' });
  if (upstream.ok) cachedModel = model;

  const raw = await upstream.text();
  if (!upstream.ok) {
    const detail = googleMessage(raw);
    if (upstream.status === 401 || upstream.status === 403) {
      return json(502, {
        error: 'The server’s Gemini API key was rejected. Check GEMINI_API_KEY in Vercel.',
      });
    }
    if (upstream.status === 429) {
      const wait = googleRetrySeconds(raw);
      return json(429, {
        error: isDailyQuota(raw)
          ? 'Every Gemini model on this key has used up its free requests for today. The allowance resets at midnight Pacific. The first-pass checks are all on the phone and still running, so catches can still be judged.'
          : `Gemini is rate limited right now${wait ? `: try again in about ${String(wait)} second${wait === 1 ? '' : 's'}.` : '. Wait a minute, then try again.'}`,
      });
    }
    if (upstream.status === 503 || upstream.status === 500) {
      return json(503, {
        error:
          'Gemini is busy right now: every model this key offers turned the photo away. This clears on its own; try again in a minute.',
      });
    }
    if (upstream.status === 404) {
      return json(502, {
        error:
          (env('FISHI_MODEL')
            ? `This key cannot use the model "${model}" pinned in FISHI_MODEL. Clear that variable to let the server pick one.`
            : `This key cannot call "${model}".`) + (detail ? ` Google says: ${detail}` : ''),
      });
    }
    return json(502, {
      error: `Gemini returned ${String(upstream.status)}${detail ? `: ${detail}` : ''}`,
    });
  }

  let data: {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return json(502, { error: 'Gemini returned an unreadable response.' });
  }
  const cand = data.candidates?.[0];
  if (!cand) {
    const blocked = data.promptFeedback?.blockReason;
    return json(502, {
      error: blocked
        ? `Gemini declined to review this image (${blocked}). Review it manually.`
        : 'Gemini returned no answer. Try again.',
    });
  }
  if (cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
    return json(502, { error: 'Gemini declined to review this image. Review it manually.' });
  }
  if (cand.finishReason === 'MAX_TOKENS') {
    return json(502, { error: 'Gemini ran out of room mid-answer. Try again.' });
  }
  const text = (cand.content?.parts ?? []).map((p) => p.text ?? '').join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return json(502, { error: 'Fish-I gave an unreadable answer. Try again.' });
  }

  const review = {
    ...normalize(parsed as Record<string, unknown>),
    model,
    reviewedAt: new Date().toISOString(),
  };
  // Saved on the catch, as the director, so every director's phone sees it.
  // A save that fails still hands the answer back; the phone can show it.
  let saved = false;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/director_set_ai_review`, {
      method: 'POST',
      headers: { ...as, 'content-type': 'application/json' },
      body: JSON.stringify({ p_id: catchId, p_review: review }),
    });
    saved = res.ok;
  } catch {
    saved = false;
  }
  return json(200, { review, saved });
}
