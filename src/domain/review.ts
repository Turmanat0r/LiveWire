// What the director's review card says about a fish before anyone looks at
// the photo: the old app's "first pass". Nothing here rejects anything; it
// sorts the queue into clear, look closer, and needs review, with reasons.
import { CLOCK_TOLERANCE_MS, skewText } from './capture';
import type { BoundaryVerdict } from './geo';
import { isDuplicate, photoHashDistance } from './photo';
import { isScoringSpecies } from './scoring';
import { DEFAULT_SCHEDULE, timeOfDayText, zonedParts, type DaySchedule } from './time';
import type { Catch, DateKey, EpochMs } from './types';

/** Shortest edge of the original photo, in pixels: below this the board's marks blur. */
export const MIN_SOURCE_EDGE = 640;
/** Laplacian variance: lower is softer. */
export const BLUR_BELOW = 40;
/** Mean brightness, 0 to 255. */
export const DARK_BELOW = 55;
export const BLOWN_ABOVE = 225;
/** A photo filed this long after it was taken is worth a look: paddling back into signal takes a while. */
export const CAPTURE_LAG_MS = 20 * 60 * 1000;

export interface PhotoCheck {
  readonly hashes: readonly string[];
  readonly brightness: number;
  readonly sharpness: number;
  readonly srcWidth: number;
  readonly srcHeight: number;
}

/** A photo check as stored with a catch, read defensively: an old or odd one is no check. */
export function parsePhotoCheck(value: unknown): PhotoCheck | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const num = (k: string) => (typeof v[k] === 'number' ? v[k] : null);
  const hashes = Array.isArray(v['hashes'])
    ? v['hashes'].filter((h): h is string => typeof h === 'string')
    : typeof v['hash'] === 'string'
      ? [v['hash']]
      : [];
  const brightness = num('brightness');
  const sharpness = num('sharpness');
  if (brightness === null || sharpness === null) return null;
  return {
    hashes,
    brightness,
    sharpness,
    srcWidth: num('srcWidth') ?? 0,
    srcHeight: num('srcHeight') ?? 0,
  };
}

export interface ReviewFish {
  readonly fish: Catch;
  /** The angler's real name: this is the director's screen. */
  readonly anglerName: string;
  readonly photo: PhotoCheck | null;
  readonly hasPosition: boolean;
  readonly verdict: BoundaryVerdict | null;
}

export interface ReviewContext {
  /** Every catch in the event, for duplicates and for what the field looks like. */
  readonly field: readonly ReviewFish[];
  /** Each species' record length; none for a species without one. */
  readonly records: ReadonlyMap<string, number>;
  readonly scoringSpecies: readonly string[];
  readonly dates: readonly DateKey[];
  readonly timeZone: string;
  readonly schedule?: DaySchedule;
}

export type CheckLevel = 'info' | 'review' | 'flag';

export interface FirstPassCheck {
  readonly level: CheckLevel;
  readonly label: string;
  readonly detail: string;
}

export interface FirstPass {
  readonly level: 'clear' | 'review' | 'flag';
  readonly checks: readonly FirstPassCheck[];
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}${String(minutes % 60).padStart(2, '0')}`;

export function firstPass(r: ReviewFish, ctx: ReviewContext): FirstPass {
  const checks: FirstPassCheck[] = [];
  const { fish, photo } = r;
  const schedule = ctx.schedule ?? DEFAULT_SCHEDULE;

  if (!photo) {
    checks.push({
      level: 'info',
      label: 'Photo not analyzed',
      detail: 'Filed without the automatic photo checks.',
    });
  } else {
    const shortEdge = Math.min(photo.srcWidth, photo.srcHeight);
    if (shortEdge > 0 && shortEdge < MIN_SOURCE_EDGE) {
      checks.push({
        level: 'review',
        label: 'Low-resolution photo',
        detail: `${String(photo.srcWidth)}x${String(photo.srcHeight)}: board graduations may not be readable.`,
      });
    }
    if (photo.sharpness < BLUR_BELOW) {
      checks.push({
        level: 'review',
        label: 'Photo looks soft or out of focus',
        detail: `Focus measure ${photo.sharpness.toFixed(0)} (below ${String(BLUR_BELOW)}). Consider asking for a re-shoot.`,
      });
    }
    if (photo.brightness < DARK_BELOW) {
      checks.push({
        level: 'review',
        label: 'Photo is very dark',
        detail: `Mean brightness ${photo.brightness.toFixed(0)}/255.`,
      });
    } else if (photo.brightness > BLOWN_ABOVE) {
      checks.push({
        level: 'review',
        label: 'Photo is blown out',
        detail: `Mean brightness ${photo.brightness.toFixed(0)}/255: detail may be lost to glare.`,
      });
    }

    // The strongest fraud signal there is: the same photo filed twice.
    if (photo.hashes.length > 0) {
      const hit = ctx.field
        .filter((o) => o.fish.id !== fish.id && o.photo && o.photo.hashes.length > 0)
        .map((o) => ({ other: o, match: photoHashDistance(photo.hashes, o.photo?.hashes ?? []) }))
        .filter((x) => isDuplicate(x.match))
        .sort((a, b) => a.match.distance - b.match.distance)[0];
      if (hit) {
        const same = hit.other.fish.anglerId === fish.anglerId;
        const how = hit.match.cropped
          ? `One is a crop of the other (${String(hit.match.distance)}/64 bits differ once the crop is matched up)`
          : `Near-identical photo (${String(hit.match.distance)}/64 bits differ)`;
        checks.push({
          level: 'flag',
          label:
            (same
              ? 'Possible duplicate of this angler’s own entry'
              : `Possible duplicate of ${hit.other.anglerName}’s entry`) +
            (hit.match.cropped ? ', cropped' : ''),
          detail: `${how} to a ${String(hit.other.fish.lengthInches)}″ ${hit.other.fish.species} filed at ${timeOfDayText(hit.other.fish.loggedAt, ctx.timeZone)}.`,
        });
      }
    }
  }

  // Length: against this species' own record, so a big pike never trips a walleye's.
  const record = ctx.records.get(fish.species);
  if (isScoringSpecies(fish.species, ctx.scoringSpecies) && record && fish.lengthInches > record) {
    checks.push({
      level: 'flag',
      label: 'Length exceeds the record',
      detail: `${String(fish.lengthInches)}″ is longer than the ${String(record)}″ ceiling set for ${fish.species.toLowerCase()} in this event. Re-read the board before approving.`,
    });
  } else {
    const lengths = ctx.field
      .filter(
        (o) =>
          o.fish.id !== fish.id && o.fish.species === fish.species && o.fish.status === 'approved',
      )
      .map((o) => o.fish.lengthInches)
      .sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    if (lengths.length >= 5 && median !== undefined && fish.lengthInches > median * 1.5) {
      checks.push({
        level: 'review',
        label: 'Well above the rest of the field',
        detail: `${String(fish.lengthInches)}″ vs a ${median.toFixed(1)}″ median across ${String(lengths.length)} approved ${fish.species.toLowerCase()}. Not wrong, just worth a second look.`,
      });
    }
  }

  // When it was logged, against the fishing day.
  const t = zonedParts(fish.loggedAt, ctx.timeZone);
  if (!ctx.dates.includes(t.dateKey)) {
    // Normal in practice and testing, so a note rather than a flag.
    checks.push({
      level: 'info',
      label: 'Not an event day',
      detail: `Logged ${t.dateKey}; the tournament runs ${ctx.dates.join(' and ')}.`,
    });
  } else {
    const minutes = Math.floor(t.secondsOfDay / 60);
    if (minutes < schedule.linesInMinutes || minutes > schedule.linesOutMinutes) {
      checks.push({
        level: 'flag',
        label: 'Submitted outside fishing hours',
        detail: `Logged at ${timeOfDayText(fish.loggedAt, ctx.timeZone)}; lines are ${hhmm(schedule.linesInMinutes)} to ${hhmm(schedule.linesOutMinutes)}.`,
      });
    }
  }

  if (!r.hasPosition) {
    checks.push({
      level: 'review',
      label: 'No GPS on this submission',
      detail: 'Location was unavailable or denied when the catch was logged.',
    });
  } else if (r.verdict && r.verdict.kind !== 'unchecked' && !r.verdict.within) {
    checks.push({
      level: 'flag',
      label: 'Outside the course boundary',
      detail:
        r.verdict.outsideMiles > 0
          ? `${r.verdict.outsideMiles.toFixed(1)} mi past the course boundary.`
          : 'Logged outside the course boundary.',
    });
  }

  const level = checks.some((c) => c.level === 'flag')
    ? 'flag'
    : checks.some((c) => c.level === 'review')
      ? 'review'
      : 'clear';
  return { level, checks };
}

export interface StampBadge {
  readonly tone: 'ok' | 'warn' | 'bad' | 'plain';
  readonly text: string;
}

function lagText(ms: number): string {
  const mins = Math.round(Math.abs(ms) / 60_000);
  if (mins < 90) return `${String(mins)} min`;
  const hours = Math.abs(ms) / 3_600_000;
  return `${hours < 10 ? hours.toFixed(1) : String(Math.round(hours))} hr`;
}

/** What the photo's stamp is worth, as the old app's badges said it. */
export function stampBadges(s: {
  readonly source: 'camera' | 'upload' | null;
  readonly capturedAt: EpochMs | null;
  readonly clockOffsetMs: number | null;
  readonly loggedAt: EpochMs;
}): StampBadge[] {
  if (s.source === null) return [{ tone: 'plain', text: 'No photo stamp' }];
  const out: StampBadge[] = [
    s.source === 'upload'
      ? { tone: 'warn', text: 'Uploaded file' }
      : { tone: 'ok', text: 'In-app camera' },
  ];
  if (s.clockOffsetMs === null) out.push({ tone: 'plain', text: 'Clock unverified' });
  else if (Math.abs(s.clockOffsetMs) > CLOCK_TOLERANCE_MS) {
    out.push({ tone: 'bad', text: `Clock ${skewText(s.clockOffsetMs)}` });
  }
  if (s.capturedAt !== null) {
    const lag = s.loggedAt - s.capturedAt;
    // A photo stamped after the catch that holds it cannot have happened: the
    // clock moved between the two.
    if (lag < -60_000) out.push({ tone: 'bad', text: 'Stamped after it was filed' });
    else if (lag > CAPTURE_LAG_MS)
      out.push({ tone: 'warn', text: `Filed ${lagText(lag)} after capture` });
  }
  return out;
}
