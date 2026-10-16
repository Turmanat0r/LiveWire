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
import { entryNumberText } from '../domain/identity';
import { standings } from '../domain/scoring';
import { boardCatches, useBoard } from './board';
import type { OutboxItem } from './local';
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

export type DayStatus = 'not in' | 'on water' | 'complete';

export interface Contestant {
  readonly anglerId: string;
  readonly entryId: string;
  /** MKWO-001 */
  readonly entryNumber: string;
  readonly division: Row<'entries'>['division'];
  readonly role: Row<'anglers'>['role'];
  readonly name: string;
  readonly handle: string;
  readonly phone: string;
  /** The Tournament ID: what an angler needs, with their phone, to bring their entry onto a phone. */
  readonly code: string;
  readonly teamCode: string | null;
  readonly partner: string | null;
  readonly bigFish: boolean;
  readonly disqualified: boolean;
  readonly dqReason: string;
  readonly feePaid: boolean;
  /** 0 when not on the board. */
  readonly rank: number;
  readonly best: number;
  /** One per fishing day, in order, with the day it is. */
  readonly days: readonly DayStatus[];
  readonly dates: readonly string[];
  /** Each day's check-in and check-out, as the server has them. */
  readonly times: readonly { readonly inAt: string | null; readonly outAt: string | null }[];
  readonly resident: boolean;
  readonly emergencyName: string;
  readonly emergencyPhone: string;
  /** Their catches, newest first. */
  readonly fish: readonly Row<'catches'>[];
  /** A change the director made to this angler is still waiting to send. */
  readonly sending: boolean;
}

type Args = Readonly<Record<string, unknown>>;
const text = (a: Args, k: string) => (typeof a[k] === 'string' ? a[k] : null);

/**
 * The director's changes still in the outbox, laid over the copy, so the
 * roster shows each one at once, signal or not.
 */
export function withQueued(
  list: readonly Contestant[],
  items: readonly OutboxItem[],
): Contestant[] {
  let out = [...list];
  for (const item of items) {
    if (item.failure !== null) continue;
    for (const step of item.steps) {
      if (step.kind !== 'call') continue;
      const a: Args = step.args;
      const angler = text(a, 'p_angler_id');
      const entry = text(a, 'p_entry_id');
      const change = (match: (c: Contestant) => boolean, to: (c: Contestant) => Contestant) => {
        out = out.map((c) => (match(c) ? { ...to(c), sending: true } : c));
      };
      switch (step.fn) {
        case 'director_set_fee_paid':
          change(
            (c) => c.entryId === entry,
            (c) => ({ ...c, feePaid: a['p_paid'] === true }),
          );
          break;
        case 'director_disqualify':
          change(
            (c) => c.anglerId === angler,
            (c) => ({ ...c, disqualified: true, dqReason: text(a, 'p_reason') ?? '', rank: 0 }),
          );
          break;
        case 'director_reinstate':
          change(
            (c) => c.anglerId === angler,
            (c) => ({ ...c, disqualified: false, dqReason: '' }),
          );
          break;
        case 'director_update_angler':
          change(
            (c) => c.anglerId === angler,
            (c) => ({
              ...c,
              name: text(a, 'p_full_name') ?? c.name,
              phone: text(a, 'p_phone') ?? c.phone,
              handle: text(a, 'p_handle') ?? c.handle,
              bigFish: a['p_big_fish'] === true,
              resident: a['p_resident'] === true,
              emergencyName: text(a, 'p_emergency_name') ?? c.emergencyName,
              emergencyPhone: text(a, 'p_emergency_phone') ?? c.emergencyPhone,
            }),
          );
          break;
        case 'director_set_check_in': {
          const day = text(a, 'p_day');
          const status: DayStatus = !a['p_in_at']
            ? 'not in'
            : a['p_out_at']
              ? 'complete'
              : 'on water';
          const inAt = text(a, 'p_in_at');
          const outAt = text(a, 'p_out_at');
          change(
            (c) => c.anglerId === angler,
            (c) => ({
              ...c,
              days: c.days.map((d, i) => (c.dates[i] === day ? status : d)),
              times: c.times.map((t, i) => (c.dates[i] === day ? { inAt, outAt } : t)),
            }),
          );
          break;
        }
        case 'director_remove_entry':
          out = out.filter((c) => c.entryId !== entry);
          break;
        default:
          break;
      }
    }
  }
  return out;
}

export interface Outstanding {
  /** Entries with no fee matched, one per team. */
  readonly entries: readonly { readonly entryId: string; readonly names: string }[];
  readonly cents: number;
}

/** What the roster says has not been paid yet, priced from the event's fees. */
export function outstandingFees(
  list: readonly Contestant[],
  fees: { readonly solo: number; readonly team: number; readonly bigFish: number },
): Outstanding {
  const byEntry = new Map<string, Contestant[]>();
  for (const c of list) {
    if (c.feePaid) continue;
    byEntry.set(c.entryId, [...(byEntry.get(c.entryId) ?? []), c]);
  }
  let cents = 0;
  const entries = [...byEntry].map(([entryId, people]) => {
    const [first] = people;
    cents += first?.division === 'team' ? fees.team : fees.solo;
    cents += people.filter((p) => p.bigFish).length * fees.bigFish;
    return { entryId, names: people.map((p) => p.name).join(' & ') };
  });
  return { entries, cents };
}

/**
 * Every angler in the event, as the director sees them: whoever is placed
 * first, in order, then everyone else by name.
 */
export function useContestants(): readonly Contestant[] {
  const board = useBoard();
  const anglerRows = useSync((s) => s.tables.anglers);
  const entries = useSync((s) => s.tables.entries);
  const entryPrivate = useSync((s) => s.tables.entry_private);
  const privates = useSync((s) => s.tables.angler_private);
  const checkIns = useSync((s) => s.tables.check_ins);
  const days = useSync((s) => s.tables.event_days);
  const catchRows = useSync((s) => s.tables.catches);
  const items = useSync((s) => s.outbox.items);
  return useMemo(() => {
    if (!board) return [];
    const { event, anglers, catches, species } = board;
    const entryOf = new Map([...entries.values()].map((e) => [e.id, e]));
    const money = new Map([...entryPrivate.values()].map((e) => [e.entry_id, e]));
    const details = new Map([...privates.values()].map((p) => [p.angler_id, p]));
    const dates = eventDates(days, event.id);
    const rank = new Map<string, number>();
    for (const division of ['solo', 'team'] as const) {
      standings(division, catches, anglers, species).forEach((row, i) => {
        // A team ranks as one, so both partners carry its place.
        for (const a of anglers) {
          if (row.anglerIds.includes(a.id) || a.teamId === row.key) rank.set(a.id, i + 1);
        }
      });
    }
    const best = new Map<string, number>();
    for (const c of catches) {
      if (c.status !== 'approved' || !species.includes(c.species)) continue;
      best.set(c.anglerId, Math.max(best.get(c.anglerId) ?? 0, c.lengthInches));
    }
    const rows = [...anglerRows.values()].filter((a) => a.event_id === event.id);
    const out: Contestant[] = rows.flatMap((a) => {
      const entry = entryOf.get(a.entry_id);
      if (!entry) return [];
      const p = details.get(a.id);
      const mate = rows.find((m) => m.entry_id === a.entry_id && m.id !== a.id);
      const statusOn = (day: string): DayStatus => {
        const c = [...checkIns.values()].find((x) => x.angler_id === a.id && x.day === day);
        if (!c?.in_at) return 'not in';
        return c.out_at ? 'complete' : 'on water';
      };
      return [
        {
          anglerId: a.id,
          entryId: a.entry_id,
          entryNumber: entryNumberText(event.entry_prefix, entry.entry_number),
          division: entry.division,
          role: a.role,
          name: p?.full_name ?? a.handle,
          handle: a.handle,
          phone: p?.phone ?? '',
          code: p?.angler_code ?? '',
          teamCode: money.get(a.entry_id)?.team_code ?? null,
          partner: mate ? (details.get(mate.id)?.full_name ?? mate.handle) : null,
          bigFish: a.big_fish,
          disqualified: a.disqualified,
          dqReason: p?.dq_reason ?? '',
          feePaid: money.get(a.entry_id)?.fee_paid ?? false,
          rank: a.disqualified ? 0 : (rank.get(a.id) ?? 0),
          best: best.get(a.id) ?? 0,
          days: dates.map(statusOn),
          dates,
          times: dates.map((day) => {
            const c = [...checkIns.values()].find((x) => x.angler_id === a.id && x.day === day);
            return { inAt: c?.in_at ?? null, outAt: c?.out_at ?? null };
          }),
          resident: p?.resident ?? false,
          emergencyName: p?.emergency_name ?? '',
          emergencyPhone: p?.emergency_phone ?? '',
          fish: [...catchRows.values()]
            .filter((c) => c.angler_id === a.id)
            .sort((x, y) => y.logged_at.localeCompare(x.logged_at)),
          sending: false,
        },
      ];
    });
    return withQueued(out, items).sort((x, y) => {
      if (x.rank && y.rank) return x.rank - y.rank || x.name.localeCompare(y.name);
      if (x.rank) return -1;
      if (y.rank) return 1;
      return x.name.localeCompare(y.name);
    });
  }, [board, anglerRows, entries, entryPrivate, privates, checkIns, days, catchRows, items]);
}

/** Case does not matter to a search. */
function folded(text: string): string {
  return text.toLowerCase();
}

/**
 * Contestants a search finds: by name, handle, Tournament ID, team code,
 * entry number, or any run of phone digits.
 */
export function findContestants(list: readonly Contestant[], query: string): Contestant[] {
  const q = folded(query.trim());
  if (!q) return [...list];
  const digits = q.replace(/\D/g, '');
  return list.filter((c) => {
    const words = [c.name, c.handle, c.code, c.teamCode ?? '', c.entryNumber]
      .map(folded)
      .some((w) => w.includes(q));
    const phone = digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits);
    return words || phone;
  });
}
