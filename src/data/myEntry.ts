// This phone's entry in the current event, from the phone's own copy, so it is
// known with no signal. A phone holds at most one entry per event: the one it
// registered, or the one brought onto it with a board code and phone number.
import { useMemo } from 'react';
import type { TableMaps } from './replica';
import type { Row } from './tables';
import { useSync } from './useSync';

export interface EntryAngler {
  readonly angler: Row<'anglers'>;
  /** Name, phone, board code: readable here because this is their own phone. */
  readonly details: Row<'angler_private'> | null;
}

export interface MyEntry {
  readonly entry: Row<'entries'>;
  readonly details: Row<'entry_private'> | null;
  /** The solo angler, or the captain then the partner. */
  readonly anglers: readonly EntryAngler[];
  /** The angler this phone is: who it checks in first and posts as. */
  readonly me: EntryAngler;
  /** The other half of a team, whose check-ins and fish this phone also handles. */
  readonly partner: EntryAngler | null;
}

const ROLE_ORDER: Record<Row<'anglers'>['role'], number> = { solo: 0, captain: 0, partner: 1 };

export function findMyEntry(
  tables: Pick<
    TableMaps,
    'entry_devices' | 'entries' | 'entry_private' | 'anglers' | 'angler_private'
  >,
  event: Row<'events'> | null,
  userId: string | null,
): MyEntry | null {
  if (!event || !userId) return null;
  // Only the director's phone can read other phones' links; match on the account.
  const link = [...tables.entry_devices.values()].find(
    (d) => d.user_id === userId && d.event_id === event.id,
  );
  if (!link) return null;
  const entry = [...tables.entries.values()].find((e) => e.id === link.entry_id);
  if (!entry) return null;
  const details = [...tables.entry_private.values()].find((p) => p.entry_id === entry.id) ?? null;
  const privates = new Map([...tables.angler_private.values()].map((p) => [p.angler_id, p]));
  const anglers = [...tables.anglers.values()]
    .filter((a) => a.entry_id === entry.id)
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role])
    .map((angler) => ({ angler, details: privates.get(angler.id) ?? null }));
  const me = anglers.find((a) => a.angler.id === link.angler_id) ?? anglers[0];
  if (!me) return null;
  const partner = anglers.find((a) => a !== me) ?? null;
  return { entry, details, anglers, me, partner };
}

export function useMyEntry(): MyEntry | null {
  const event = useSync((s) => s.event);
  const userId = useSync((s) => s.userId);
  const entryDevices = useSync((s) => s.tables.entry_devices);
  const entries = useSync((s) => s.tables.entries);
  const entryPrivate = useSync((s) => s.tables.entry_private);
  const anglers = useSync((s) => s.tables.anglers);
  const anglerPrivate = useSync((s) => s.tables.angler_private);
  return useMemo(
    () =>
      findMyEntry(
        {
          entry_devices: entryDevices,
          entries,
          entry_private: entryPrivate,
          anglers,
          angler_private: anglerPrivate,
        },
        event,
        userId,
      ),
    [event, userId, entryDevices, entries, entryPrivate, anglers, anglerPrivate],
  );
}
