// The board: the current event's anglers and catches in the shapes the rules
// in src/domain work on, so every screen that ranks or pays uses the same
// rules the parity tests prove against the old app.
import { useMemo } from 'react';
import { compareIds } from '../domain/scoring';
import type { Angler, Catch } from '../domain/types';
import type { Row } from './tables';
import { useSync } from './useSync';

/**
 * Anglers as the rules see them. Whether a fee has been paid is between the
 * angler and the director, so a phone does not know it: `feePaid` is false
 * here, and the payout screen asks the server for counts instead.
 */
export function boardAnglers(
  anglers: Iterable<Row<'anglers'>>,
  entries: Iterable<Row<'entries'>>,
  eventId: string,
): Angler[] {
  const division = new Map([...entries].map((e) => [e.id, e.division]));
  const out: Angler[] = [];
  for (const a of anglers) {
    const d = division.get(a.entry_id);
    if (a.event_id !== eventId || !d) continue;
    out.push({
      id: a.id,
      handle: a.handle,
      division: d,
      role: a.role,
      teamId: d === 'team' ? a.entry_id : null,
      bigFish: a.big_fish,
      feePaid: false,
      disqualified: a.disqualified,
    });
  }
  return out.sort((x, y) => compareIds(x.id, y.id));
}

export function boardCatches(catches: Iterable<Row<'catches'>>, eventId: string): Catch[] {
  const out: Catch[] = [];
  for (const c of catches) {
    if (c.event_id !== eventId) continue;
    out.push({
      id: c.id,
      anglerId: c.angler_id,
      division: c.division,
      species: c.species,
      lengthInches: c.length_inches,
      loggedAt: Date.parse(c.logged_at),
      status: c.status,
    });
  }
  return out;
}

/** The species that score, in the director's order. */
export function scoringSpecies(species: Iterable<Row<'event_species'>>, eventId: string): string[] {
  return [...species]
    .filter((s) => s.event_id === eventId)
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name);
}

/** "walleye", "walleye or pike", "walleye, pike or perch": the old app's wording. */
export function speciesPhrase(species: readonly string[]): string {
  const names = species.map((n) => n.toLowerCase());
  const last = names.at(-1);
  if (last === undefined) return 'scoring fish';
  if (names.length === 1) return last;
  return `${names.slice(0, -1).join(', ')} or ${last}`;
}

/** A standings row's name: a handle, or a team's two handles. */
export function rowName(key: string, anglers: readonly Angler[]): string {
  const team = anglers
    .filter((a) => a.teamId === key)
    .sort((a, b) => (a.role === 'partner' ? 1 : 0) - (b.role === 'partner' ? 1 : 0));
  if (team.length > 0) return team.map((a) => a.handle).join(' & ');
  return anglers.find((a) => a.id === key)?.handle ?? 'An angler';
}

export interface Board {
  readonly event: Row<'events'>;
  readonly anglers: readonly Angler[];
  readonly catches: readonly Catch[];
  readonly species: readonly string[];
}

export function useBoard(): Board | null {
  const event = useSync((s) => s.event);
  const anglers = useSync((s) => s.tables.anglers);
  const entries = useSync((s) => s.tables.entries);
  const catches = useSync((s) => s.tables.catches);
  const species = useSync((s) => s.tables.event_species);
  return useMemo(() => {
    if (!event) return null;
    return {
      event,
      anglers: boardAnglers(anglers.values(), entries.values(), event.id),
      catches: boardCatches(catches.values(), event.id),
      species: scoringSpecies(species.values(), event.id),
    };
  }, [event, anglers, entries, catches, species]);
}
