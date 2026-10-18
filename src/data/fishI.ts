// Talking to Fish-I (api/fish-i.ts) from the director's review screen. It needs
// signal, and only the director's session gets an answer. The answer is saved
// on the catch by the server, so it reaches every director's phone the usual
// way; this hands it back at once as well.
import { useEffect, useState } from 'react';
import { readFishIReview, type FishIReview } from '../domain/fishI';
import type { Sync } from './sync';
import { useSyncEngine } from './useSync';

const ENDPOINT = '/api/fish-i';

export type FishIState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'unavailable'; readonly why: string };

const unavailable = (why: string): FishIState => ({ kind: 'unavailable', why });

/** Each has a different fix, so each says where to go. */
const REASONS: Readonly<Record<string, string>> = {
  'no-api-key':
    'the server has no Gemini API key. Add GEMINI_API_KEY in Vercel, Settings, Environment Variables, then redeploy.',
  'bad-key':
    'the server’s Gemini API key was rejected. Check GEMINI_API_KEY in Vercel, then redeploy.',
  'bad-model':
    'this API key has no vision model available to it. Check the key in Google AI Studio, or pin one with FISHI_MODEL in Vercel.',
  'no-auth-config':
    'the server cannot check who is asking, so it refuses every request. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Vercel and redeploy.',
  unreachable: 'the server could not reach Gemini. Try again in a moment.',
};

async function session(sync: Sync): Promise<Record<string, string>> {
  const token = await sync.accessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Asks the server whether Fish-I can answer for this session. Spends no Gemini quota. */
async function askStatus(sync: Sync): Promise<FishIState> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { headers: await session(sync) });
  } catch {
    return unavailable('there is no signal, or the server did not answer. Retry with signal.');
  }
  if (!res.ok) {
    return unavailable(
      res.status === 404
        ? 'this copy of the app has no Fish-I server function.'
        : `the server answered ${String(res.status)}.`,
    );
  }
  let info: unknown;
  try {
    info = await res.json();
  } catch {
    // A page came back instead: this address serves the app but not its functions.
    return unavailable('this copy of the app has no Fish-I server function.');
  }
  const answer = (typeof info === 'object' && info !== null ? info : {}) as Readonly<
    Record<string, unknown>
  >;
  if (answer['ready'] === true) return { kind: 'ready' };
  const reason = typeof answer['reason'] === 'string' ? answer['reason'] : '';
  const detail = typeof answer['detail'] === 'string' ? answer['detail'] : '';
  if (reason === 'not-director') return unavailable(detail || 'Fish-I is for the director.');
  return unavailable(REASONS[reason] ?? 'the server reports Fish-I as unavailable.');
}

const asked = new WeakMap<Sync, Promise<FishIState>>();

/**
 * Whether Fish-I can answer, asked once when the review first opens (not by
 * every phone at the ramp), and again on Retry.
 */
export function useFishIStatus(): { readonly state: FishIState; readonly retry: () => void } {
  const sync = useSyncEngine();
  const [attempt, setAttempt] = useState(0);
  const [known, setKnown] = useState<{ attempt: number; state: FishIState } | null>(null);
  useEffect(() => {
    let alive = true;
    let asking = attempt === 0 ? asked.get(sync) : undefined;
    if (!asking) {
      asking = askStatus(sync);
      asked.set(sync, asking);
    }
    void asking.then((state) => {
      if (alive) setKnown({ attempt, state });
    });
    return () => {
      alive = false;
    };
  }, [sync, attempt]);
  return {
    state: known?.attempt === attempt ? known.state : { kind: 'checking' },
    retry: () => {
      setAttempt((a) => a + 1);
    },
  };
}

/** Has Fish-I look at one catch. Throws with the server's own words when it cannot. */
export async function askFishI(sync: Sync, catchId: string): Promise<FishIReview> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await session(sync)) },
      body: JSON.stringify({ catchId }),
    });
  } catch {
    throw new Error('There is no signal, or the server did not answer. Try again with signal.');
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Said below.
  }
  const body = (typeof payload === 'object' && payload !== null ? payload : {}) as Readonly<
    Record<string, unknown>
  >;
  if (!res.ok) {
    throw new Error(
      typeof body['error'] === 'string'
        ? body['error']
        : `The Fish-I server answered ${String(res.status)}.`,
    );
  }
  const review = readFishIReview(body['review']);
  if (!review) throw new Error('Fish-I gave an unreadable answer. Try again.');
  return review;
}
