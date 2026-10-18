// The fish gallery: every approved fish of the current event, yours first.
// The whole field sees it, so an angler is their handle and nothing else.
import { useMemo } from 'react';
import { compareIds } from '../domain/scoring';
import { useMyEntry } from './myEntry';
import type { Row } from './tables';
import { useSync } from './useSync';

export interface GalleryRow {
  readonly id: string;
  readonly anglerId: string;
  readonly handle: string;
  readonly species: string;
  readonly inches: number;
  readonly loggedAt: string;
  readonly path: string;
  /** Filed by this phone's entry. */
  readonly mine: boolean;
}

/**
 * Approved fish only, and none from a disqualified angler: the same rule as
 * the board, because a gallery still showing their fish asks a question nobody
 * wants asked at the prizegiving. Yours first, then the newest, so a fish you
 * just landed is at the top of your own block.
 */
export function galleryRows(
  catches: Iterable<Row<'catches'>>,
  anglers: Iterable<Row<'anglers'>>,
  eventId: string,
  mine: ReadonlySet<string>,
): GalleryRow[] {
  const byId = new Map([...anglers].map((a) => [a.id, a]));
  const out: GalleryRow[] = [];
  for (const c of catches) {
    if (c.event_id !== eventId || c.status !== 'approved') continue;
    const a = byId.get(c.angler_id);
    if (a?.disqualified) continue;
    out.push({
      id: c.id,
      anglerId: c.angler_id,
      handle: a?.handle ?? 'An angler',
      species: c.species,
      inches: c.length_inches,
      loggedAt: c.logged_at,
      path: c.photo_path,
      mine: mine.has(c.angler_id),
    });
  }
  return out.sort(
    (x, y) =>
      Number(y.mine) - Number(x.mine) ||
      y.loggedAt.localeCompare(x.loggedAt) ||
      compareIds(x.id, y.id),
  );
}

export function useGallery(): readonly GalleryRow[] {
  const event = useSync((s) => s.event);
  const catches = useSync((s) => s.tables.catches);
  const anglers = useSync((s) => s.tables.anglers);
  const mine = useMyEntry();
  return useMemo(() => {
    if (!event) return [];
    const ids = new Set(mine?.anglers.map((a) => a.angler.id) ?? []);
    return galleryRows(catches.values(), anglers.values(), event.id, ids);
  }, [event, catches, anglers, mine]);
}

/** "MKWO-Walleye-24.75in.jpg": a name somebody can find again in a camera roll. */
export function photoFileName(prefix: string, species: string, inches: number): string {
  const bits = [prefix || 'LiveWire', species, `${inches.toFixed(2)}in`].filter(Boolean);
  return `${bits
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')}.jpg`;
}
