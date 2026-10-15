// What the director's screens are built from. Signed in as the director, the
// phone's copy holds every angler's private details and every catch's
// evidence (row-level security lets the director read them), so these work
// with no signal too, from the last copy.
import { useMemo } from 'react';
import { parseVerdict, type BoundaryVerdict } from '../domain/geo';
import {
  firstPass,
  parsePhotoCheck,
  stampBadges,
  type FirstPass,
  type ReviewFish,
  type StampBadge,
} from '../domain/review';
import { overdueAnglers, sortOverdue, type CheckIn } from '../domain/safety';
import { scheduleFrom } from '../domain/time';
import { boardCatches } from './board';
import type { Row } from './tables';
import { useSync } from './useSync';
import { eventDates } from './selectors';

export interface ReviewItem {
  readonly row: Row<'catches'>;
  readonly evidence: Row<'catch_evidence'> | null;
  readonly review: ReviewFish;
  readonly firstPass: FirstPass;
  readonly stamp: readonly StampBadge[];
  /** "Filed by the director", or by a phone not on the angler's entry; null when the angler's own. */
  readonly filedBy: string | null;
  readonly handle: string;
}

export function useReviewItems(): readonly ReviewItem[] {
  const event = useSync((s) => s.event);
  const catches = useSync((s) => s.tables.catches);
  const evidence = useSync((s) => s.tables.catch_evidence);
  const privates = useSync((s) => s.tables.angler_private);
  const anglers = useSync((s) => s.tables.anglers);
  const devices = useSync((s) => s.tables.entry_devices);
  const species = useSync((s) => s.tables.event_species);
  const days = useSync((s) => s.tables.event_days);
  return useMemo(() => {
    if (!event) return [];
    const names = new Map([...privates.values()].map((p) => [p.angler_id, p.full_name]));
    const anglerRows = new Map([...anglers.values()].map((a) => [a.id, a]));
    const evidenceOf = new Map([...evidence.values()].map((e) => [e.catch_id, e]));
    const entryUsers = new Map<string, Set<string>>();
    for (const d of devices.values()) {
      const set = entryUsers.get(d.entry_id) ?? new Set<string>();
      set.add(d.user_id);
      entryUsers.set(d.entry_id, set);
    }
    const rows = [...catches.values()].filter((c) => c.event_id === event.id);
    const shaped = new Map(boardCatches(rows, event.id).map((c) => [c.id, c]));
    const field: ReviewFish[] = [];
    const base = rows.flatMap((row) => {
      const fish = shaped.get(row.id);
      if (!fish) return [];
      const e = evidenceOf.get(row.id) ?? null;
      const verdict: BoundaryVerdict | null = parseVerdict(e?.boundary);
      const review: ReviewFish = {
        fish,
        anglerName:
          names.get(row.angler_id) ?? anglerRows.get(row.angler_id)?.handle ?? 'An angler',
        photo: parsePhotoCheck(e?.precheck),
        hasPosition: e?.lat !== null && e?.lat !== undefined,
        verdict,
      };
      field.push(review);
      return [{ row, e, review }];
    });
    const ctx = {
      field,
      records: new Map(
        [...species.values()]
          .filter((s) => s.event_id === event.id && s.record_inches !== null)
          .map((s) => [s.name, s.record_inches ?? 0]),
      ),
      scoringSpecies: [...species.values()]
        .filter((s) => s.event_id === event.id)
        .map((s) => s.name),
      dates: eventDates(days, event.id),
      timeZone: event.time_zone,
      schedule: scheduleFrom(event.lines_in, event.lines_out, event.final_check_in),
    };
    return base.map(({ row, e, review }) => {
      const angler = anglerRows.get(row.angler_id);
      const own = angler ? entryUsers.get(angler.entry_id) : undefined;
      const filedBy = !e
        ? null
        : e.filed_by_director
          ? 'Filed by the director'
          : e.filed_by && own && !own.has(e.filed_by)
            ? 'Filed from a phone not on this entry'
            : null;
      return {
        row,
        evidence: e,
        review,
        firstPass: firstPass(review, ctx),
        stamp: stampBadges({
          source: e?.photo_source ?? null,
          capturedAt: e?.captured_at ? Date.parse(e.captured_at) : null,
          clockOffsetMs: e?.clock_offset_ms ?? null,
          loggedAt: review.fish.loggedAt,
        }),
        filedBy,
        handle: angler?.handle ?? '',
      };
    });
  }, [event, catches, evidence, privates, anglers, devices, species, days]);
}

export interface OverdueRow {
  readonly anglerId: string;
  readonly name: string;
  readonly code: string;
  readonly phone: string;
  readonly emergencyName: string;
  readonly emergencyPhone: string;
  /** When this angler's phone last reported a position; null for never. */
  readonly lastSeenAt: number | null;
  readonly lat: number | null;
  readonly lng: number | null;
}

/**
 * Who launched today and has not come back, once the final check-in has
 * passed: stalest position first, because a position that old is the worst
 * news. Real names and numbers: this is the director's screen, and the point
 * is being able to ring somebody.
 */
export function useOverdue(now: number): { minutes: number; rows: readonly OverdueRow[] } | null {
  const event = useSync((s) => s.event);
  const checkIns = useSync((s) => s.tables.check_ins);
  const positions = useSync((s) => s.tables.positions);
  const privates = useSync((s) => s.tables.angler_private);
  const days = useSync((s) => s.tables.event_days);
  return useMemo(() => {
    if (!event) return null;
    const dates = eventDates(days, event.id);
    const schedule = scheduleFrom(event.lines_in, event.lines_out, event.final_check_in);
    const list: CheckIn[] = [...checkIns.values()]
      .filter((c) => c.event_id === event.id)
      .map((c) => ({
        anglerId: c.angler_id,
        date: c.day,
        inAt: c.in_at ? Date.parse(c.in_at) : null,
        outAt: c.out_at ? Date.parse(c.out_at) : null,
      }));
    const overdue = overdueAnglers(list, now, dates, event.time_zone, schedule);
    const [first] = overdue;
    if (!first) return null;
    const seen = new Map([...positions.values()].map((p) => [p.angler_id, p] as const));
    const details = new Map([...privates.values()].map((p) => [p.angler_id, p]));
    const sorted = sortOverdue(
      overdue,
      new Map([...seen].map(([id, p]) => [id, Date.parse(p.recorded_at)])),
      (id) => details.get(id)?.full_name ?? '',
      now,
    );
    // Everyone on the list missed the same deadline.
    return {
      minutes: Math.floor(first.overdueSeconds / 60),
      rows: sorted.map(({ anglerId }) => {
        const p = details.get(anglerId);
        const pos = seen.get(anglerId);
        return {
          anglerId,
          name: p?.full_name ?? 'An angler',
          code: p?.angler_code ?? '',
          phone: p?.phone ?? '',
          emergencyName: p?.emergency_name ?? '',
          emergencyPhone: p?.emergency_phone ?? '',
          lastSeenAt: pos ? Date.parse(pos.recorded_at) : null,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        };
      }),
    };
  }, [event, checkIns, positions, privates, days, now]);
}
