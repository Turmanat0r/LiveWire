// The event details form: what the director types, checked here before it is
// sent, so a mistake is named next to the box it is in rather than coming
// back from the server as a refusal.
import type { Json } from '../../data/remote';
import type { Row } from '../../data/tables';
import type { Boundary } from '../../domain/geo';
import { parseDollars } from '../../domain/money';
import { isValidTimeZone, lastOpenDateKey, midnightIn, nextDateKey } from '../../domain/time';

export const TIME_ZONES: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'America/New_York', label: 'Eastern' },
  { id: 'America/Chicago', label: 'Central' },
  { id: 'America/Denver', label: 'Mountain' },
  { id: 'America/Phoenix', label: 'Arizona (no daylight saving)' },
  { id: 'America/Los_Angeles', label: 'Pacific' },
  { id: 'America/Anchorage', label: 'Alaska' },
  { id: 'Pacific/Honolulu', label: 'Hawaii' },
];

/** Every box on the form, as typed. */
export interface EventDraft {
  readonly name: string;
  readonly presenter: string;
  readonly prefix: string;
  readonly timeZone: string;
  /** One date per fishing day, YYYY-MM-DD. */
  readonly days: readonly string[];
  /** The last day registration is open. */
  readonly lastDay: string;
  readonly linesIn: string;
  readonly linesOut: string;
  readonly finalCheckIn: string;
  /** Short, on the home screen: "Canyon Ferry". */
  readonly courseLabel: string;
  /** In full, on Register: "Canyon Ferry Reservoir · Silos to the Ponds". */
  readonly courseLabelLong: string;
  readonly feeSolo: string;
  readonly feeTeam: string;
  readonly feeBigFish: string;
  /** Percentages per place: "50/30/20". */
  readonly split: string;
}

const dollars = (cents: number) =>
  cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);

/** "07:00:00" → "07:00" */
const hhmm = (time: string) => time.slice(0, 5);

export function splitFromBasisPoints(points: readonly number[]): string {
  return points.map((p) => String(p / 100)).join('/');
}

/** An existing event, ready to edit. */
export function draftFrom(event: Row<'events'>, days: readonly string[]): EventDraft {
  return {
    name: event.name,
    presenter: event.presenter,
    prefix: event.entry_prefix,
    timeZone: event.time_zone,
    days: [...days].sort(),
    lastDay: lastOpenDateKey(Date.parse(event.registration_closes_at), event.time_zone),
    linesIn: hhmm(event.lines_in),
    linesOut: hhmm(event.lines_out),
    finalCheckIn: hhmm(event.final_check_in),
    courseLabel: event.course_label,
    courseLabelLong: event.course_label_long,
    feeSolo: dollars(event.fee_solo_cents),
    feeTeam: dollars(event.fee_team_cents),
    feeBigFish: dollars(event.fee_big_fish_cents),
    split: splitFromBasisPoints(event.payout_basis_points),
  };
}

/** A new event: the money, the clock and who presents it carried over from the live one. */
export function newDraft(live: Row<'events'> | null): EventDraft {
  return {
    name: '',
    presenter: live?.presenter ?? '',
    prefix: '',
    timeZone: live?.time_zone ?? 'America/Denver',
    days: [''],
    lastDay: '',
    linesIn: live ? hhmm(live.lines_in) : '07:00',
    linesOut: live ? hhmm(live.lines_out) : '14:00',
    finalCheckIn: live ? hhmm(live.final_check_in) : '15:00',
    courseLabel: live?.course_label ?? '',
    courseLabelLong: live?.course_label_long ?? '',
    feeSolo: live ? dollars(live.fee_solo_cents) : '30',
    feeTeam: live ? dollars(live.fee_team_cents) : '50',
    feeBigFish: live ? dollars(live.fee_big_fish_cents) : '10',
    split: live ? splitFromBasisPoints(live.payout_basis_points) : '50/30/20',
  };
}

/** "50/30/20" → [5000, 3000, 2000]; null for anything the payout rules cannot use. */
export function parseSplit(text: string): number[] | null {
  const parts = text
    .split(/[/,\s]+/)
    .map((p) => p.replace('%', ''))
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 10) return null;
  const points = parts.map((p) => (/^\d+(\.\d{1,2})?$/.test(p) ? Math.round(Number(p) * 100) : 0));
  if (points.some((p) => p <= 0)) return null;
  return points.reduce((s, p) => s + p, 0) <= 10_000 ? points : null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Checked =
  | { readonly ok: true; readonly args: Readonly<Record<string, Json>> }
  | { readonly ok: false; readonly problem: string };

/** The draft as director_save_event's arguments, or what is wrong with it. */
export function eventArgs(id: string, d: EventDraft): Checked {
  const no = (problem: string): Checked => ({ ok: false, problem });
  const name = d.name.trim();
  if (!name) return no('Give the tournament a name.');
  if (name.length > 120) return no('The name is too long: 120 characters at most.');
  const prefix = d.prefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(prefix)) {
    return no('The entry ID prefix is 2 to 10 letters and numbers, like MKWO27.');
  }
  if (!isValidTimeZone(d.timeZone)) return no('Pick the time zone the event is fished in.');
  const days = [...new Set(d.days.map((x) => x.trim()).filter(Boolean))].sort();
  if (days.length === 0 || days.some((x) => !DATE.test(x))) {
    return no('Give every fishing day a date.');
  }
  if (days.length > 7) return no('An event runs for one to seven days.');
  if (!DATE.test(d.lastDay)) return no('Give the last day registration is open.');
  if (![d.linesIn, d.linesOut, d.finalCheckIn].every((t) => TIME.test(t))) {
    return no('Give lines in, lines out and the final check-in as times of day.');
  }
  if (!(d.linesIn < d.linesOut && d.linesOut <= d.finalCheckIn)) {
    return no(
      'Lines in comes before lines out, and the final check-in is no earlier than lines out.',
    );
  }
  const solo = parseDollars(d.feeSolo || '0');
  const team = parseDollars(d.feeTeam || '0');
  const bigFish = parseDollars(d.feeBigFish || '0');
  if (solo === null || team === null || bigFish === null) {
    return no('Give each entry fee in dollars, like 30 or 30.00.');
  }
  const split = parseSplit(d.split);
  if (!split) {
    return no(
      'The payout split is a percentage for each place, 1st first, like 50/30/20, adding up to 100 or less.',
    );
  }
  if (d.courseLabel.length > 120 || d.courseLabelLong.length > 200) {
    return no('The water’s name is too long.');
  }
  return {
    ok: true,
    args: {
      p_id: id,
      p_name: name,
      p_presenter: d.presenter.trim(),
      p_entry_prefix: prefix,
      p_time_zone: d.timeZone,
      p_registration_closes_at: new Date(
        midnightIn(nextDateKey(d.lastDay), d.timeZone),
      ).toISOString(),
      p_days: days,
      p_lines_in: d.linesIn,
      p_lines_out: d.linesOut,
      p_final_check_in: d.finalCheckIn,
      p_course_label: d.courseLabel.trim(),
      p_course_label_long: d.courseLabelLong.trim(),
      p_fee_solo_cents: solo,
      p_fee_team_cents: team,
      p_fee_big_fish_cents: bigFish,
      p_payout_basis_points: split,
    },
  };
}

/** A course as the server keeps it. */
export function courseJson(b: Boundary): Json {
  switch (b.kind) {
    case 'none':
      return { kind: 'none' };
    case 'circle':
      return {
        kind: 'circle',
        center: { lat: b.center.lat, lng: b.center.lng },
        radiusMiles: b.radiusMiles,
      };
    case 'polygon':
      return { kind: 'polygon', points: b.points.map((p) => ({ lat: p.lat, lng: p.lng })) };
  }
}
