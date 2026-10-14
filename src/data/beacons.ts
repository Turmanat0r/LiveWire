// Beacons: anglers asking for help. Every phone in the event sees an active
// one, because the nearest help on a reservoir is another kayak.
import { useMemo } from 'react';
import { compassFrom, milesBetween, type CompassPoint } from '../domain/geo';
import type { LatLng } from '../domain/types';
import type { OutboxItem } from './local';
import { useMyEntry } from './myEntry';
import type { Row } from './tables';
import { useSync } from './useSync';

export interface ActiveBeacon {
  readonly beacon: Row<'beacons'>;
  /** The angler's handle: the name the field knows them by. */
  readonly handle: string;
  /** Raised by this phone's entry. */
  readonly mine: boolean;
  /** From this phone's last fix, when there is one. */
  readonly miles: number | null;
  readonly direction: CompassPoint | null;
}

/**
 * The event's beacons that are up: this phone's own first, then the nearest,
 * because the nearest angler is the one who can do something. With no fix of
 * our own, the newest first.
 */
export function activeBeacons(
  beacons: Iterable<Row<'beacons'>>,
  anglers: Iterable<Row<'anglers'>>,
  eventId: string,
  mine: ReadonlySet<string>,
  from: LatLng | null,
): ActiveBeacon[] {
  const handles = new Map([...anglers].map((a) => [a.id, a.handle]));
  return [...beacons]
    .filter((b) => b.event_id === eventId && b.stood_down_at === null)
    .map((beacon) => ({
      beacon,
      handle: handles.get(beacon.angler_id) ?? 'An angler',
      mine: mine.has(beacon.angler_id),
      miles: from ? milesBetween(from, beacon) : null,
      direction: from ? compassFrom(from, beacon) : null,
    }))
    .sort((x, y) => {
      if (x.mine !== y.mine) return x.mine ? -1 : 1;
      if (x.miles !== null && y.miles !== null) return x.miles - y.miles;
      return y.beacon.raised_at.localeCompare(x.beacon.raised_at);
    });
}

export function useActiveBeacons(from: LatLng | null): ActiveBeacon[] {
  const event = useSync((s) => s.event);
  const beacons = useSync((s) => s.tables.beacons);
  const anglers = useSync((s) => s.tables.anglers);
  const mine = useMyEntry();
  return useMemo(() => {
    if (!event) return [];
    const ids = new Set(mine?.anglers.map((a) => a.angler.id) ?? []);
    return activeBeacons(beacons.values(), anglers.values(), event.id, ids, from);
  }, [event, beacons, anglers, mine, from]);
}

function isBeaconItem(
  item: OutboxItem,
  fns: readonly string[],
  anglerIds: ReadonlySet<string>,
): boolean {
  return item.steps.some((s) => {
    if (s.kind !== 'call' || !fns.includes(s.fn)) return false;
    const angler = s.args['p_angler_id'];
    return typeof angler === 'string' && anglerIds.has(angler);
  });
}

/** An outbox item still waiting to raise or stand down a beacon for one of these anglers. */
export function pendingBeacon(
  items: readonly OutboxItem[],
  fn: 'raise_beacon' | 'stand_down_beacon',
  anglerIds: ReadonlySet<string>,
): OutboxItem | undefined {
  return items.find((item) => item.failure === null && isBeaconItem(item, [fn], anglerIds));
}

/** Beacon requests the server turned down, to be said out loud. */
export function refusedBeacons(
  items: readonly OutboxItem[],
  anglerIds: ReadonlySet<string>,
): OutboxItem[] {
  return items.filter(
    (item) =>
      item.failure !== null && isBeaconItem(item, ['raise_beacon', 'stand_down_beacon'], anglerIds),
  );
}

export type BeaconPhase = 'none' | 'raising' | 'up' | 'standing-down';

/**
 * Where this phone's own beacon stands, the outbox included: a beacon raised
 * with no signal is already "raising", and one stood down with none is
 * already on its way down.
 */
export function beaconPhase(
  up: boolean,
  items: readonly OutboxItem[],
  anglerIds: ReadonlySet<string>,
): BeaconPhase {
  const raise = pendingBeacon(items, 'raise_beacon', anglerIds);
  const down = pendingBeacon(items, 'stand_down_beacon', anglerIds);
  // The later of the two waiting items is what the angler last asked for.
  if (raise && (!down || raise.seq > down.seq)) return up ? 'up' : 'raising';
  if (down) return 'standing-down';
  return up ? 'up' : 'none';
}

export interface MyBeacon {
  readonly phase: BeaconPhase;
  /** The server's copy, once it is up. */
  readonly beacon: Row<'beacons'> | null;
  /** Who it is for: from the server's copy, or from the request still waiting. */
  readonly anglerId: string | null;
  readonly refused: readonly OutboxItem[];
}

/** This phone's own beacon, from the server's copy and the outbox together. */
export function useMyBeacon(): MyBeacon {
  const event = useSync((s) => s.event);
  const beacons = useSync((s) => s.tables.beacons);
  const items = useSync((s) => s.outbox.items);
  const mine = useMyEntry();
  return useMemo(() => {
    const ids = new Set(mine?.anglers.map((a) => a.angler.id) ?? []);
    const beacon =
      [...beacons.values()].find(
        (b) => b.event_id === event?.id && b.stood_down_at === null && ids.has(b.angler_id),
      ) ?? null;
    const raise = pendingBeacon(items, 'raise_beacon', ids);
    const step = raise?.steps.find((s) => s.kind === 'call' && s.fn === 'raise_beacon');
    const waitingFor = step?.kind === 'call' ? step.args['p_angler_id'] : undefined;
    return {
      phase: beaconPhase(beacon !== null, items, ids),
      beacon,
      anglerId: beacon?.angler_id ?? (typeof waitingFor === 'string' ? waitingFor : null),
      refused: refusedBeacons(items, ids),
    };
  }, [event, beacons, items, mine]);
}
