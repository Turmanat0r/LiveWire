import type { DateKey, EpochMs } from './types';
import { DEFAULT_SCHEDULE, zonedParts, type DaySchedule } from './time';

// Who is still on the water. At the final check-in on a cold reservoir the
// question is not "what is everyone's status" but "who is unaccounted for".

export interface CheckIn {
  readonly anglerId: string;
  readonly date: DateKey;
  readonly inAt: EpochMs | null;
  readonly outAt: EpochMs | null;
}

export interface Overdue {
  readonly anglerId: string;
  readonly overdueSeconds: number;
}

/**
 * Anglers who checked in today and have not checked out, once the final
 * check-in has passed. Empty before then: someone still out is still fishing.
 * Someone who never checked in never launched.
 */
export function overdueAnglers(
  checkIns: readonly CheckIn[],
  at: EpochMs,
  dates: readonly DateKey[],
  timeZone: string,
  schedule: DaySchedule = DEFAULT_SCHEDULE,
): Overdue[] {
  const now = zonedParts(at, timeZone);
  if (!dates.includes(now.dateKey)) return [];
  const deadline = schedule.finalCheckInMinutes * 60;
  if (now.secondsOfDay < deadline) return [];
  const overdueSeconds = now.secondsOfDay - deadline;
  return checkIns
    .filter((c) => c.date === now.dateKey && c.inAt !== null && c.outAt === null)
    .map((c) => ({ anglerId: c.anglerId, overdueSeconds }));
}

/** Minutes since a position was recorded; Infinity when there is none. */
export function signalAgeMinutes(at: EpochMs | null, now: EpochMs): number {
  if (at === null || at === 0) return Infinity;
  return Math.max(0, (now - at) / 60_000);
}

/** Past this, a position is history rather than a location. */
export const SIGNAL_STALE_MINUTES = 45;

/**
 * Overdue anglers, the stalest position first: they all missed the same
 * deadline, so who was seen longest ago is the worst news. Never seen at all
 * comes first of everything. Ties go by name.
 */
export function sortOverdue<T extends { readonly anglerId: string }>(
  list: readonly T[],
  lastSeenAt: ReadonlyMap<string, EpochMs>,
  nameOf: (anglerId: string) => string,
  now: EpochMs,
): T[] {
  return [...list].sort((x, y) => {
    const ax = signalAgeMinutes(lastSeenAt.get(x.anglerId) ?? null, now);
    const ay = signalAgeMinutes(lastSeenAt.get(y.anglerId) ?? null, now);
    if (ax !== ay) return ay - ax;
    return nameOf(x.anglerId).localeCompare(nameOf(y.anglerId));
  });
}

/** How long ago a position was taken, in the old app's words. */
export function ageText(at: EpochMs | null, now: EpochMs): string {
  const mins = signalAgeMinutes(at, now);
  if (!Number.isFinite(mins)) return 'never';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${String(Math.round(mins))} min ago`;
  const hours = mins / 60;
  if (hours < 2) return '1 hour ago';
  if (hours < 24) return `${String(Math.round(hours))} hours ago`;
  return 'over a day ago';
}
