// The Fish-I server function with Supabase and Gemini played by a stand-in:
// who may ask, what it reads, what it sends Google, how it falls back, and
// what it saves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SUPABASE = 'https://project.supabase.co';
const CATCH = '6f1c2a9e-1111-4222-8333-944455556666';
const EVENT = '00000000-0000-4000-8000-000000000001';
const DIRECTOR = 'director-session';
const ANGLER = 'angler-session';

interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** Supabase and Gemini as a test wants them; every request is recorded. */
function world(over: { generate?: (model: string) => Response } = {}) {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const answer = {
    species: 'walleye',
    speciesConfidence: 0.93,
    matchesClaim: true,
    boardVisible: true,
    fishFlat: true,
    noseAtStop: false,
    tailInFrame: true,
    handBlocking: false,
    concerns: ['Nose sits a little off the stop.'],
    notes: 'A clear photo of a walleye on a bump board.',
  };
  const generate =
    over.generate ??
    (() =>
      json({
        candidates: [
          { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } },
        ],
      }));
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      const auth = new Headers(init?.headers).get('authorization');
      if (url === `${SUPABASE}/auth/v1/user`) {
        if (auth === `Bearer ${DIRECTOR}`)
          return Promise.resolve(json({ id: 'd', app_metadata: { director: true } }));
        if (auth === `Bearer ${ANGLER}`)
          return Promise.resolve(json({ id: 'a', app_metadata: {} }));
        return Promise.resolve(json({ msg: 'bad_jwt' }, 403));
      }
      if (url.startsWith(`${SUPABASE}/rest/v1/catches?id=eq.${CATCH}`)) {
        return Promise.resolve(
          json([
            {
              event_id: EVENT,
              species: 'Walleye',
              length_inches: 21.5,
              photo_path: `${EVENT}/${CATCH}.jpg`,
            },
          ]),
        );
      }
      if (url.startsWith(`${SUPABASE}/rest/v1/catches?`)) return Promise.resolve(json([]));
      if (url.startsWith(`${SUPABASE}/rest/v1/events?`)) {
        return Promise.resolve(json([{ course_label_long: 'Canyon Ferry Reservoir' }]));
      }
      if (url.startsWith(`${SUPABASE}/rest/v1/event_species?`)) {
        return Promise.resolve(json([{ name: 'Walleye' }, { name: 'Northern Pike' }]));
      }
      if (
        url === `${SUPABASE}/storage/v1/object/authenticated/catch-photos/${EVENT}/${CATCH}.jpg`
      ) {
        return Promise.resolve(
          new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
            headers: { 'content-type': 'image/jpeg' },
          }),
        );
      }
      if (url === `${SUPABASE}/rest/v1/rpc/director_set_ai_review`) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) {
        return Promise.resolve(
          json({
            models: [
              { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              {
                name: 'models/gemini-2.5-flash-lite',
                supportedGenerationMethods: ['generateContent'],
              },
              { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
            ],
          }),
        );
      }
      const generating = /\/models\/([^:]+):generateContent$/.exec(url);
      if (generating?.[1]) return Promise.resolve(generate(decodeURIComponent(generating[1])));
      return Promise.reject(new Error(`Nothing answers ${url}`));
    }),
  );
  return { calls, json };
}

/** What a recorded request sent: always a JSON string here. */
function bodyOf(call: Call | undefined): string {
  const body = call?.init?.body;
  if (typeof body !== 'string') throw new Error('expected a JSON body');
  return body;
}

async function fishI() {
  vi.resetModules();
  return import('../../api/fish-i');
}

const post = (token: string | null, body: unknown = { catchId: CATCH }) =>
  new Request('https://livewire.test/api/fish-i', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.0.0.${String(Math.floor(Math.random() * 250))}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
const get = (token: string | null) =>
  new Request('https://livewire.test/api/fish-i', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', SUPABASE);
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
  vi.stubEnv('FISHI_MODEL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the health check', () => {
  it('says why it is not ready, and which model would answer when it is', async () => {
    world();
    const { GET } = await fishI();
    vi.stubEnv('GEMINI_API_KEY', '');
    expect(await (await GET(get(DIRECTOR))).json()).toEqual({ ready: false, reason: 'no-api-key' });
    vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
    expect(await (await GET(get(ANGLER))).json()).toMatchObject({
      ready: false,
      reason: 'not-director',
    });
    expect(await (await GET(get(null))).json()).toMatchObject({
      ready: false,
      reason: 'not-director',
    });
    // Stable flash first: the free tier, and quick.
    expect(await (await GET(get(DIRECTOR))).json()).toEqual({
      ready: true,
      model: 'gemini-2.5-flash',
    });
  });

  it('never spends quota to answer', async () => {
    const { calls } = world();
    const { GET } = await fishI();
    await GET(get(DIRECTOR));
    expect(calls.some((c) => c.url.includes(':generateContent'))).toBe(false);
  });
});

describe('a look at a catch', () => {
  it('reads the catch as the director, asks Gemini, and saves the answer on the catch', async () => {
    const { calls } = world();
    const { POST } = await fishI();
    const res = await POST(post(DIRECTOR));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { review: Record<string, unknown>; saved: boolean };
    expect(body.saved).toBe(true);
    expect(body.review).toMatchObject({
      species: 'walleye',
      speciesConfidence: 0.93,
      noseAtStop: false,
      concerns: ['Nose sits a little off the stop.'],
      model: 'gemini-2.5-flash',
    });

    // Supabase was asked as the director, never as the server.
    for (const c of calls.filter((x) => x.url.startsWith(SUPABASE))) {
      expect(new Headers(c.init?.headers).get('authorization')).toBe(`Bearer ${DIRECTOR}`);
    }
    // Google got the photo and the prompt built here, from the catch's own record.
    const asked = calls.find((c) => c.url.includes(':generateContent'));
    const sent = JSON.parse(bodyOf(asked)) as {
      contents: {
        parts: [{ inline_data: { mime_type: string; data: string } }, { text: string }];
      }[];
    };
    const [image, prompt] = sent.contents[0]?.parts ?? [];
    expect(image?.inline_data).toEqual({ mime_type: 'image/jpeg', data: '/9j/2Q==' });
    expect(prompt?.text).toContain('walleye or northern pike tournament on Canyon Ferry Reservoir');
    expect(prompt?.text).toContain('The angler entered this as a WALLEYE');
    expect(prompt?.text).toContain('21.5 inches');
    // And the answer went onto the catch.
    const save = calls.find((c) => c.url.endsWith('/rpc/director_set_ai_review'));
    expect(JSON.parse(bodyOf(save))).toMatchObject({
      p_id: CATCH,
      p_review: { species: 'walleye', model: 'gemini-2.5-flash' },
    });
  });

  it('moves down the list when a model is gone or out of quota', async () => {
    const { json, calls } = world({
      generate: (model) =>
        model === 'gemini-2.5-flash'
          ? json({ error: { message: 'gone' } }, 404)
          : model === 'gemini-2.5-flash-lite'
            ? json({ error: { message: 'busy' } }, 429)
            : json({
                candidates: [
                  {
                    finishReason: 'STOP',
                    content: { parts: [{ text: '{"species":"walleye","concerns":[]}' }] },
                  },
                ],
              }),
    });
    const { POST } = await fishI();
    const body = (await (await POST(post(DIRECTOR))).json()) as { review: { model: string } };
    expect(body.review.model).toBe('gemini-2.5-pro');
    expect(
      calls
        .filter((c) => c.url.includes(':generateContent'))
        .map((c) => /models\/([^:]+)/.exec(c.url)?.[1]),
    ).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']);
  });

  it('says when the day’s free allowance is spent on every model', async () => {
    const { json } = world({
      generate: () =>
        json(
          {
            error: {
              message: 'Quota exceeded',
              details: [
                { violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] },
              ],
            },
          },
          429,
        ),
    });
    const { POST } = await fishI();
    const res = await POST(post(DIRECTOR));
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: string }).error).toContain('resets at midnight Pacific');
  });

  it('is for the director only, and only about a real catch', async () => {
    const { calls } = world();
    const { POST } = await fishI();
    expect((await POST(post(null))).status).toBe(401);
    expect((await POST(post('expired'))).status).toBe(401);
    expect((await POST(post(ANGLER))).status).toBe(403);
    expect((await POST(post(DIRECTOR, { catchId: 'not-a-catch' }))).status).toBe(400);
    expect(
      (await POST(post(DIRECTOR, { catchId: '6f1c2a9e-1111-4222-8333-000000000000' }))).status,
    ).toBe(404);
    // None of that reached Google.
    expect(calls.some((c) => c.url.includes('googleapis'))).toBe(false);
  });
});
