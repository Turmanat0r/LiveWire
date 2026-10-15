// How many entries each payout pool is built from. Who has paid is between the
// angler and the director, so phones never read it: the server counts, and
// only the counts come back (public.pool_counts).
import { useEffect, useState } from 'react';
import type { Json } from './remote';
import { useSync, useSyncEngine } from './useSync';

export interface PoolCounts {
  readonly soloPaid: number;
  readonly teamsPaid: number;
  readonly bigFishPaid: number;
  /** Paid entries that can still place: a disqualified one forfeits its place, not its fee. */
  readonly soloEligible: number;
  readonly teamsEligible: number;
}

/** The server's answer, read defensively. */
export function parsePoolCounts(value: Json): PoolCounts | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const n = (key: string) => {
    const v = row[key];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
  };
  const soloPaid = n('solo_paid');
  const teamsPaid = n('teams_paid');
  const bigFishPaid = n('big_fish_paid');
  const soloEligible = n('solo_eligible');
  const teamsEligible = n('teams_eligible');
  if (
    soloPaid === null ||
    teamsPaid === null ||
    bigFishPaid === null ||
    soloEligible === null ||
    teamsEligible === null
  ) {
    return null;
  }
  return { soloPaid, teamsPaid, bigFishPaid, soloEligible, teamsEligible };
}

/** A fee being matched is not something a phone hears about, so the counts are asked again this often. */
export const POOL_REFRESH_MS = 60_000;

interface Kept {
  readonly counts: PoolCounts;
  readonly at: number;
}

// The last answer per event, so coming back to the screen shows it at once.
const kept = new Map<string, Kept>();

/** For tests. */
export function forgetPoolCounts(): void {
  kept.clear();
}

/**
 * The current event's pool counts: asked for on opening, when the phone comes
 * back online, when a donation or an entry changes, and every minute while
 * the screen is open.
 */
export function usePoolCounts(eventId: string | null): Kept | null {
  const sync = useSyncEngine();
  const connection = useSync((s) => s.connection);
  const donations = useSync((s) => s.tables.donations);
  const entries = useSync((s) => s.tables.entries);
  // Bumped when an answer arrives; the answer itself is kept per event, above.
  const [, setAnswers] = useState(0);

  useEffect(() => {
    // An ordinary request, not the live channel: worth trying unless the phone
    // is known to be offline, and again whenever the connection changes.
    if (!eventId || connection === 'offline' || connection === 'unconfigured') return;
    let alive = true;
    const ask = () => {
      sync.call('pool_counts', { p_event_id: eventId }).then(
        (answer) => {
          const counts = parsePoolCounts(answer);
          if (!alive || !counts) return;
          kept.set(eventId, { counts, at: Date.now() });
          setAnswers((n) => n + 1);
        },
        () => undefined,
      );
    };
    ask();
    const timer = setInterval(ask, POOL_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sync, eventId, connection, donations, entries]);

  return eventId ? (kept.get(eventId) ?? null) : null;
}
