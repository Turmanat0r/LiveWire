// The trophy case's record. This tournament comes from the phone's own copy,
// so it shows with no signal. Every earlier one is read from the server once a
// session and kept: a finished tournament does not change, and the frozen
// result it is placed from cannot.
import { useEffect, useMemo, useState } from 'react';
import { compareIds } from '../domain/scoring';
import {
  trophyStats,
  type FrozenResult,
  type TrophyEvent,
  type TrophyStats,
} from '../domain/trophies';
import type { DateKey } from '../domain/types';
import { boardAnglers, boardCatches, scoringSpecies } from './board';
import { useMyEntry } from './myEntry';
import type { Json } from './remote';
import { parseResults, resultsView } from './results';
import type { Sync } from './sync';
import type { Row } from './tables';
import { useSync, useSyncEngine } from './useSync';

/** One tournament's rows, as much of them as the trophy case reads. */
export interface EventRows {
  readonly anglers: readonly Row<'anglers'>[];
  readonly entries: readonly Row<'entries'>[];
  readonly catches: readonly Row<'catches'>[];
  readonly event_species: readonly Row<'event_species'>[];
  readonly event_days: readonly Row<'event_days'>[];
  readonly bets: readonly Row<'bets'>[];
}

/** One of your anglers, in some tournament, and the days they finished there. */
export interface TrophyAngler {
  readonly anglerId: string;
  readonly eventId: string;
  readonly fullDays: readonly DateKey[];
}

export function trophyEvent(
  event: Row<'events'>,
  rows: EventRows,
  frozen: FrozenResult | null,
  fullDays: readonly DateKey[],
): TrophyEvent {
  const days = rows.event_days
    .filter((d) => d.event_id === event.id)
    .map((d) => d.day)
    .sort();
  return {
    id: event.id,
    name: event.name,
    year: (days.at(-1) ?? '').slice(0, 4),
    timeZone: event.time_zone,
    species: scoringSpecies(rows.event_species, event.id),
    anglers: boardAnglers(rows.anglers, rows.entries, event.id),
    catches: boardCatches(rows.catches, event.id),
    bets: rows.bets
      .filter((b) => b.event_id === event.id && b.settled_at !== null)
      .map((b) => ({ title: b.title, winnerId: b.winner_angler_id })),
    frozen,
    fullDays,
  };
}

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The server's answer to my_trophy_anglers, read defensively. */
export function parseTrophyAnglers(value: Json): TrophyAngler[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) => {
    if (!isObject(r)) return [];
    const { angler_id: anglerId, event_id: eventId, full_days: days } = r;
    if (typeof anglerId !== 'string' || typeof eventId !== 'string') return [];
    const fullDays = Array.isArray(days)
      ? days.filter((d): d is string => typeof d === 'string')
      : [];
    return [{ anglerId, eventId, fullDays }];
  });
}

interface Past {
  readonly mine: readonly TrophyAngler[];
  readonly events: ReadonlyMap<string, EventRows & { readonly results: readonly Row<'results'>[] }>;
}

async function readPast(sync: Sync, currentEventId: string | null): Promise<Past> {
  const mine = parseTrophyAnglers(await sync.call('my_trophy_anglers', {}));
  const ids = [...new Set(mine.map((m) => m.eventId))].filter((id) => id !== currentEventId);
  const events = await Promise.all(
    ids.map(async (id) => {
      const [anglers, entries, catches, species, days, bets, results] = await Promise.all([
        sync.peek('anglers', id),
        sync.peek('entries', id),
        sync.peek('catches', id),
        sync.peek('event_species', id),
        sync.peek('event_days', id),
        sync.peek('bets', id),
        sync.peek('results', id),
      ]);
      return [
        id,
        { anglers, entries, catches, event_species: species, event_days: days, bets, results },
      ] as const;
    }),
  );
  return { mine, events: new Map(events) };
}

const kept = new WeakMap<Sync, Map<string, Promise<Past>>>();

/** Earlier tournaments, read once for this phone, this event and this entry. */
function pastFor(sync: Sync, key: string, currentEventId: string | null): Promise<Past> {
  let byKey = kept.get(sync);
  if (!byKey) {
    byKey = new Map();
    kept.set(sync, byKey);
  }
  const known = byKey.get(key);
  if (known) return known;
  const reading = readPast(sync, currentEventId);
  byKey.set(key, reading);
  // No signal this time: the next visit asks again.
  reading.catch(() => byKey.delete(key));
  return reading;
}

export interface TrophyCase {
  readonly stats: TrophyStats;
  /** The phone has an entry in some tournament, this one or an earlier one. */
  readonly anyEntry: boolean;
  /** Earlier tournaments: being looked up, looked up, or out of reach without signal. */
  readonly past: 'reading' | 'read' | 'offline';
}

export function useTrophyCase(): TrophyCase {
  const sync = useSyncEngine();
  const event = useSync((s) => s.event);
  const events = useSync((s) => s.tables.events);
  const userId = useSync((s) => s.userId);
  const anglers = useSync((s) => s.tables.anglers);
  const entries = useSync((s) => s.tables.entries);
  const catches = useSync((s) => s.tables.catches);
  const species = useSync((s) => s.tables.event_species);
  const days = useSync((s) => s.tables.event_days);
  const bets = useSync((s) => s.tables.bets);
  const results = useSync((s) => s.tables.results);
  const checkIns = useSync((s) => s.tables.check_ins);
  const items = useSync((s) => s.outbox.items);
  const myEntry = useMyEntry();
  const eventId = event?.id ?? null;
  const here = useMemo(
    () => (myEntry?.anglers ?? []).map((a) => a.angler.id).sort(compareIds),
    [myEntry],
  );
  const key = `${userId ?? ''}|${eventId ?? ''}|${here.join(',')}`;

  const [past, setPast] = useState<{ key: string; value: Past | null } | null>(null);
  useEffect(() => {
    let alive = true;
    pastFor(sync, key, eventId).then(
      (value) => {
        if (alive) setPast({ key, value });
      },
      () => {
        if (alive) setPast({ key, value: null });
      },
    );
    return () => {
      alive = false;
    };
  }, [sync, key, eventId]);
  const read = past?.key === key ? past : null;

  return useMemo(() => {
    const before = read?.value ?? null;
    const mine = new Set([...here, ...(before?.mine.map((m) => m.anglerId) ?? [])]);
    const finished = (id: string) =>
      (before?.mine ?? []).filter((m) => m.eventId === id).flatMap((m) => m.fullDays);
    const list: TrophyEvent[] = [];
    if (event) {
      // Today's check-outs count the moment they reach this phone's copy.
      const today = [...checkIns.values()]
        .filter(
          (c) =>
            c.event_id === event.id &&
            mine.has(c.angler_id) &&
            c.in_at !== null &&
            c.out_at !== null,
        )
        .map((c) => c.day);
      list.push(
        trophyEvent(
          event,
          {
            anglers: [...anglers.values()],
            entries: [...entries.values()],
            catches: [...catches.values()],
            event_species: [...species.values()],
            event_days: [...days.values()],
            bets: [...bets.values()],
          },
          resultsView(results.values(), items, event.id).record,
          [...today, ...finished(event.id)],
        ),
      );
    }
    for (const [id, rows] of before?.events ?? []) {
      const row = [...events.values()].find((e) => e.id === id);
      if (!row) continue;
      const frozen = parseResults(rows.results.find((r) => r.event_id === id)?.record);
      list.push(trophyEvent(row, rows, frozen, finished(id)));
    }
    return {
      stats: trophyStats(list, mine),
      anyEntry: mine.size > 0,
      past: read === null ? 'reading' : read.value === null ? 'offline' : 'read',
    };
  }, [
    read,
    here,
    event,
    events,
    anglers,
    entries,
    catches,
    species,
    days,
    bets,
    results,
    checkIns,
    items,
  ]);
}
