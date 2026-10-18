// The whole report in one object: the director's answers over what is
// carried from last year and what the event itself says, and every number the
// tournament recorded. The form, the printed sheet and the copied text all
// read this, so the three cannot say different things.
import type { Json } from '../../../data/remote';
import type { Row } from '../../../data/tables';
import {
  catchesPerDay,
  dayHours,
  dayRow,
  fieldCounts,
  reportDue,
  reportWarnings,
  residencyCounts,
  sizeDistribution,
  speciesTally,
  winningFish,
  type DayRow,
  type ReportAngler,
} from '../../../domain/report';
import type { CheckIn } from '../../../domain/safety';
import type { Catch, DateKey } from '../../../domain/types';

/** Who is filing: next year's report opens holding these. */
export const FILER_FIELDS = [
  'filerName',
  'filerAddress',
  'filerEmail',
  'filerPhone',
  'sponsor',
  'region',
] as const;

/** Every box that is typed text. */
export const TEXT_FIELDS = [
  ...FILER_FIELDS,
  'waterbody',
  'boats',
  'minLength',
  'airTemp',
  'waterTemp',
  'waterLevel',
  'clarity',
  'otherInfo',
  'comments',
] as const;

export type TextField = (typeof TEXT_FIELDS)[number];

export type ReportSettings = Partial<Readonly<Record<TextField, string>>> & {
  /** Times typed over the check-ins', by date. */
  readonly hours?: Readonly<Record<DateKey, { readonly start?: string; readonly stop?: string }>>;
  /** Fish that did not survive, by species. */
  readonly died?: Readonly<Record<string, number>>;
  readonly savedAt?: number;
};

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Saved answers read back defensively: anything not a known field is dropped. */
export function parseReportSettings(value: unknown): ReportSettings {
  if (!isObject(value)) return {};
  const out: Record<string, unknown> = {};
  for (const f of TEXT_FIELDS) {
    const v = value[f];
    if (typeof v === 'string') out[f] = v;
  }
  const hours = value['hours'];
  if (isObject(hours)) {
    const clean: Record<string, { start?: string; stop?: string }> = {};
    for (const [day, v] of Object.entries(hours)) {
      if (!isObject(v)) continue;
      const start = v['start'];
      const stop = v['stop'];
      clean[day] = {
        ...(typeof start === 'string' ? { start } : {}),
        ...(typeof stop === 'string' ? { stop } : {}),
      };
    }
    out['hours'] = clean;
  }
  const died = value['died'];
  if (isObject(died)) {
    const clean: Record<string, number> = {};
    for (const [species, n] of Object.entries(died)) if (typeof n === 'number') clean[species] = n;
    out['died'] = clean;
  }
  if (typeof value['savedAt'] === 'number') out['savedAt'] = value['savedAt'];
  return out;
}

export function settingsJson(s: ReportSettings): Json {
  return JSON.parse(JSON.stringify(s)) as Json;
}

/**
 * Who filed last time: the filer's details from the most recently saved
 * report of any other event that has a name in it. A director's name and
 * address do not change between tournaments; water temperatures do.
 */
export function carriedDetails(
  reports: Iterable<Row<'event_reports'>>,
  eventId: string,
): ReportSettings {
  let best: ReportSettings | null = null;
  for (const r of reports) {
    if (r.event_id === eventId) continue;
    const s = parseReportSettings(r.settings);
    if (!s.filerName) continue;
    if (!best || (s.savedAt ?? 0) > (best.savedAt ?? 0)) best = s;
  }
  const out: Record<string, string> = {};
  if (best) for (const f of FILER_FIELDS) if (best[f]) out[f] = best[f];
  return out;
}

/** A box with something in it, or undefined: an emptied box falls back again. */
const filled = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v);

/**
 * The answers in force: what was saved, over what was carried from last year.
 * The sponsor is who presents the event and the waterbody is the water's full
 * name, unless the director says otherwise: neither is a guess.
 */
export function withDefaults(
  saved: ReportSettings,
  carried: ReportSettings,
  event: Pick<Row<'events'>, 'presenter' | 'course_label_long'>,
): ReportSettings {
  const out = { ...carried, ...saved };
  return {
    ...out,
    sponsor: filled(out.sponsor) ?? event.presenter,
    waterbody: filled(out.waterbody) ?? event.course_label_long,
  };
}

export interface ReportInputs {
  readonly timeZone: string;
  readonly dates: readonly DateKey[];
  readonly anglers: readonly ReportAngler[];
  readonly checkIns: readonly CheckIn[];
  readonly catches: readonly Catch[];
  /** The species this event scores. */
  readonly species: readonly string[];
  /** In force: saved, carried and defaulted. */
  readonly settings: ReportSettings;
  readonly now: number;
}

export interface ReportDay extends DayRow {
  readonly caught: number;
  /** Null when any fish died: nothing records which day it was. */
  readonly released: number | null;
}

export function buildReport(i: ReportInputs) {
  const { settings: cfg } = i;
  const counts = fieldCounts(i.anglers);
  const perDay = catchesPerDay(i.catches, i.dates, i.timeZone);
  const species = speciesTally(i.catches, cfg.died);
  const died = species.reduce((s, r) => s + r.died, 0);
  const caught = species.reduce((s, r) => s + r.caught, 0);
  const days: ReportDay[] = dayHours(i.checkIns, i.dates).map((d) => {
    const row = dayRow(d, cfg.hours?.[d.dateKey], i.timeZone);
    const n = perDay.counts[d.dateKey] ?? 0;
    // Mortality is recorded per species, not per day: with none, every day
    // released all it caught; with some, the split is the director's to make.
    return { ...row, caught: n, released: died === 0 ? n : null };
  });
  const typedBoats = (cfg.boats ?? '').trim();
  const boats =
    typedBoats !== '' && Number.isFinite(Number(typedBoats)) ? Number(typedBoats) : null;
  return {
    settings: cfg,
    dates: i.dates,
    days,
    counts,
    residency: residencyCounts(i.anglers),
    // One angler, one kayak: what the field is, and still only a default.
    boats: boats ?? counts.anglers,
    boatsDerived: boats === null,
    winner: winningFish(i.catches, i.anglers, i.species),
    species,
    scoring: i.species,
    caught,
    died,
    sizes: sizeDistribution(i.catches),
    warnings: reportWarnings(i.anglers, i.catches, i.dates, i.timeZone),
    due: reportDue(i.dates, i.now),
  };
}

export type ReportModel = ReturnType<typeof buildReport>;

/** "9/18/2027" */
export function formDate(dateKey: DateKey): string {
  const [y = '', m = '', d = ''] = dateKey.split('-');
  return `${String(Number(m))}/${String(Number(d))}/${y}`;
}
