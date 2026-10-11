import type { DateKey, EpochMs } from './types';

/**
 * A tournament day's clock, in minutes after local midnight in the event's
 * own time zone. These used to be constants in the code (0700, 1400, 1500);
 * they are event settings now, edited by the director.
 */
export interface DaySchedule {
  readonly linesInMinutes: number;
  readonly linesOutMinutes: number;
  readonly finalCheckInMinutes: number;
}

export const DEFAULT_SCHEDULE: DaySchedule = {
  linesInMinutes: 7 * 60,
  linesOutMinutes: 14 * 60,
  finalCheckInMinutes: 15 * 60,
};

export interface ZonedParts {
  readonly dateKey: DateKey;
  readonly secondsOfDay: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The calendar date and time of day at an instant, on the event's clock. */
export function zonedParts(at: EpochMs, timeZone: string): ZonedParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatterFor(timeZone).formatToParts(at)) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    dateKey: `${values.year ?? ''}-${values.month ?? ''}-${values.day ?? ''}`,
    secondsOfDay: Number(values.hour) * 3600 + Number(values.minute) * 60 + Number(values.second),
  };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** "HH:MM:SS", never negative. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Where a tournament day stands right now. */
export type DayPhase =
  | { readonly kind: 'not-event-day' }
  | { readonly kind: 'before-lines-in'; readonly day: number; readonly linesInIn: number }
  | {
      readonly kind: 'fishing';
      readonly day: number;
      readonly linesOutIn: number;
      readonly finalCheckInIn: number;
    }
  | { readonly kind: 'return-window'; readonly day: number; readonly finalCheckInIn: number }
  | { readonly kind: 'complete'; readonly day: number };

/** Seconds are seconds until the moment named; `day` is 1-based. */
export function dayPhase(
  at: EpochMs,
  dates: readonly DateKey[],
  timeZone: string,
  schedule: DaySchedule = DEFAULT_SCHEDULE,
): DayPhase {
  const now = zonedParts(at, timeZone);
  const index = dates.indexOf(now.dateKey);
  if (index === -1) return { kind: 'not-event-day' };
  const day = index + 1;
  const s = now.secondsOfDay;
  const linesIn = schedule.linesInMinutes * 60;
  const linesOut = schedule.linesOutMinutes * 60;
  const finalCheckIn = schedule.finalCheckInMinutes * 60;
  if (s < linesIn) return { kind: 'before-lines-in', day, linesInIn: linesIn - s };
  if (s < linesOut) {
    return { kind: 'fishing', day, linesOutIn: linesOut - s, finalCheckInIn: finalCheckIn - s };
  }
  if (s < finalCheckIn) return { kind: 'return-window', day, finalCheckInIn: finalCheckIn - s };
  return { kind: 'complete', day };
}

/** Event dates are bare YYYY-MM-DD; format them in UTC so nobody west of Greenwich reads a day early. */
function dayText(dateKey: DateKey, withMonth = true): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString(
    'en-US',
    withMonth
      ? { timeZone: 'UTC', month: 'short', day: 'numeric' }
      : { timeZone: 'UTC', day: 'numeric' },
  );
}

/** "Sep 18–19, 2027", or "Sep 30–Oct 1, 2027" across a month end. */
export function dateRangeText(dates: readonly DateKey[]): string {
  const first = dates[0];
  const last = dates.at(-1);
  if (first === undefined || last === undefined) return '';
  const year = last.slice(0, 4);
  if (dates.length === 1) return `${dayText(first)}, ${year}`;
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const lastText = dayText(last, !sameMonth);
  return `${dayText(first)}–${lastText}, ${year}`;
}

/** "7:00 AM", from the database's "07:00:00". */
export function clockText(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const suffix = hours < 12 ? 'AM' : 'PM';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${String(hour)}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
