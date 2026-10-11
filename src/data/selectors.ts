import { useMemo } from 'react';
import type { Row } from './tables';
import { useSync } from './useSync';

/** An event's fishing days, in order. */
export function eventDates(
  days: ReadonlyMap<string, Row<'event_days'>>,
  eventId: string,
): readonly string[] {
  return [...days.values()]
    .filter((d) => d.event_id === eventId)
    .map((d) => d.day)
    .sort();
}

export function useEventDates(event: Row<'events'> | null): readonly string[] {
  const days = useSync((s) => s.tables.event_days);
  return useMemo(() => (event ? eventDates(days, event.id) : []), [days, event]);
}

/** The tables registering or bringing an entry over changes, read again straight after. */
export const ENTRY_TABLES = [
  'entries',
  'entry_private',
  'anglers',
  'angler_private',
  'entry_devices',
] as const;
