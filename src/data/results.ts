// A tournament's result, written down once the director freezes it. The live
// board is worked out again from the catches every time it opens, which is
// right while the event runs and wrong once it is over: a later cleanup would
// quietly rewrite what an angler was told on the day. The trophy case reads
// the frozen copy instead.
import { bigFishLeader, standings } from '../domain/scoring';
import type { Angler, Catch, Division } from '../domain/types';
import { rowName } from './board';
import type { Json } from './remote';
import type { OutboxItem } from './local';
import type { Row } from './tables';

export interface ResultPlace {
  readonly place: number;
  /** The team for a team, the angler for a solo entry. */
  readonly key: string;
  readonly anglerIds: readonly string[];
  /** As the board showed them: "Salty Bedrock Perch & Soggy Granite Walleye". */
  readonly names: string;
  readonly bestInches: number;
  readonly top3Inches: number;
  readonly fishCount: number;
}

export interface ResultsRecord {
  readonly version: 1;
  /** What scored, as it stood. */
  readonly species: readonly string[];
  readonly divisions: Readonly<Record<Division, readonly ResultPlace[]>>;
  readonly bigFish: {
    readonly anglerId: string;
    readonly catchId: string;
    readonly name: string;
    readonly inches: number;
  } | null;
  /** Settled side bets only: an open one has no winner to write down. */
  readonly bets: readonly {
    readonly id: string;
    readonly title: string;
    readonly winnerId: string | null;
    readonly winner: string;
  }[];
}

/** The result as the board stands: what freezing writes down. */
export function buildResults(
  anglers: readonly Angler[],
  catches: readonly Catch[],
  species: readonly string[],
  bets: Iterable<Row<'bets'>>,
): ResultsRecord {
  const places = (division: Division): ResultPlace[] =>
    standings(division, catches, anglers, species).map((row, i) => ({
      place: i + 1,
      key: row.key,
      anglerIds: row.anglerIds,
      names: rowName(row.key, anglers),
      bestInches: row.bestInches,
      top3Inches: row.top3Inches,
      fishCount: row.fishCount,
    }));
  const leader = bigFishLeader(catches, anglers, species);
  const handle = (id: string | null) =>
    id === null ? 'Nobody' : (anglers.find((a) => a.id === id)?.handle ?? 'An angler');
  return {
    version: 1,
    species: [...species],
    divisions: { solo: places('solo'), team: places('team') },
    bigFish: leader
      ? {
          anglerId: leader.anglerId,
          catchId: leader.id,
          name: handle(leader.anglerId),
          inches: leader.lengthInches,
        }
      : null,
    bets: [...bets]
      .filter((b) => b.settled_at !== null)
      .sort((x, y) => (x.settled_at ?? '').localeCompare(y.settled_at ?? ''))
      .map((b) => ({
        id: b.id,
        title: b.title,
        winnerId: b.winner_angler_id,
        winner: handle(b.winner_angler_id),
      })),
  };
}

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A frozen record read back defensively: anything this version did not write is null. */
export function parseResults(value: unknown): ResultsRecord | null {
  if (!isObject(value) || value['version'] !== 1) return null;
  const divisions = value['divisions'];
  if (
    !isObject(divisions) ||
    !Array.isArray(divisions['solo']) ||
    !Array.isArray(divisions['team'])
  ) {
    return null;
  }
  return value as unknown as ResultsRecord;
}

/** The record as JSON for the server. */
export function resultsJson(record: ResultsRecord): Json {
  return JSON.parse(JSON.stringify(record)) as Json;
}

export interface ResultsView {
  readonly record: ResultsRecord | null;
  /** When it was frozen, as ISO text; null while it is not. */
  readonly frozenAt: string | null;
  /** A freeze or an unfreeze is still in the outbox. */
  readonly sending: boolean;
}

/** The event's frozen result, with a freeze or unfreeze not yet sent laid over it. */
export function resultsView(
  rows: Iterable<Row<'results'>>,
  items: readonly OutboxItem[],
  eventId: string,
): ResultsView {
  const row = [...rows].find((r) => r.event_id === eventId);
  let view: ResultsView = {
    record: row ? parseResults(row.record) : null,
    frozenAt: row?.frozen_at ?? null,
    sending: false,
  };
  for (const item of items) {
    if (item.failure !== null) continue;
    for (const step of item.steps) {
      if (step.kind !== 'call' || step.args['p_event_id'] !== eventId) continue;
      if (step.fn === 'director_freeze_results') {
        view = {
          record: parseResults(step.args['p_record']),
          frozenAt: new Date(item.createdAt).toISOString(),
          sending: true,
        };
      } else if (step.fn === 'director_unfreeze_results') {
        view = { record: null, frozenAt: null, sending: true };
      }
    }
  }
  return view;
}
