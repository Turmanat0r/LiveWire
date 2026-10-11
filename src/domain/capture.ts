// Judging a camera frame, and the stamp burned into every catch photo. Pure
// arithmetic over greyscale pixels and times, so it can be tested without a
// camera or a canvas; src/photo reads the pixels and draws the stamp.
import type { EpochMs } from './types';

/**
 * Auto-capture: the frame is sampled a few times a second, and the shutter
 * fires once it has been steady, sharp and well lit for long enough. These
 * judge the photo only; whether the fish is placed right is the guide's job,
 * and the director's. The old app's values.
 */
export const AUTO_CAPTURE = {
  sampleMs: 200,
  /** Mean per-pixel change between two samples. */
  motionMax: 3.5,
  /** Laplacian variance of the 64x64 preview. */
  sharpMin: 25,
  brightMin: 50,
  brightMax: 235,
  /** Good samples in a row before the countdown starts. */
  stableSamples: 3,
  countdown: 3,
} as const;

export interface FrameStats {
  /** Mean luminance, 0 to 255. */
  readonly brightness: number;
  /** Variance of the Laplacian: the standard cheap measure of focus. */
  readonly sharpness: number;
}

/** Brightness and focus of a greyscale frame, w by h, row by row. */
export function frameStats(grey: ArrayLike<number>, w: number, h: number): FrameStats {
  const at = (i: number) => grey[i] ?? 0;
  let sum = 0;
  for (let i = 0; i < w * h; i++) sum += at(i);
  const brightness = sum / (w * h);
  const laplacian: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      laplacian.push(-4 * at(i) + at(i - w) + at(i + w) + at(i - 1) + at(i + 1));
    }
  }
  if (laplacian.length === 0) return { brightness, sharpness: 0 };
  const mean = laplacian.reduce((s, v) => s + v, 0) / laplacian.length;
  const sharpness = laplacian.reduce((s, v) => s + (v - mean) ** 2, 0) / laplacian.length;
  return { brightness, sharpness };
}

/** Mean absolute change between two frames of the same size. */
export function frameMotion(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let diff = 0;
  for (let i = 0; i < n; i++) diff += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return diff / n;
}

/** The one most useful thing wrong with the frame, or null when it is good to shoot. */
export function frameProblem(stats: FrameStats, motion: number | null): string | null {
  if (stats.brightness < AUTO_CAPTURE.brightMin) return 'Too dark';
  if (stats.brightness > AUTO_CAPTURE.brightMax) return 'Too bright: cut the glare';
  if (motion === null || motion > AUTO_CAPTURE.motionMax) return 'Hold steady';
  if (stats.sharpness < AUTO_CAPTURE.sharpMin) return 'Focusing…';
  return null;
}

/**
 * Two minutes. Phones drift a little between time syncs, and measuring the
 * offset over the network is not exact; none of that is someone moving their
 * clock to fake a catch.
 */
export const CLOCK_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * "12 min behind". Offsets are the server's time minus the phone's, so a
 * positive one is a phone running behind. Whole minutes: the measurement is
 * not more precise than that.
 */
export function skewText(offsetMs: number): string {
  const mins = Math.round(Math.abs(offsetMs) / 60_000);
  if (mins === 0) return 'under a minute';
  return `${String(mins)} min ${offsetMs > 0 ? 'behind' : 'ahead'}`;
}

/** "09/18/2027, 06:42 MDT", on the event's clock, for the stamp. */
export function stampClockText(at: EpochMs, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).format(at);
  } catch {
    // A time zone this phone does not know must not stop a catch being filed.
    return `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
}

export type PhotoSource = 'camera' | 'upload';

export interface StampInput {
  /** The event's entry prefix: MKWO. */
  readonly prefix: string;
  /** Which fishing day, from 1, or null on a day that is not one. */
  readonly day: number | null;
  readonly at: EpochMs;
  readonly timeZone: string;
  readonly source: PhotoSource;
  /** Server minus phone, or null when the phone has never been able to check. */
  readonly clockOffsetMs: number | null;
}

/**
 * The lines burned into the photo, top to bottom. In the pixels rather than
 * beside them: a field in a record can be edited, and messaging apps strip
 * the camera's own tags. A photo picked off the camera roll could have been
 * taken any time, so its stamp gives the time it was filed, and says so.
 */
export function stampLines(s: StampInput): string[] {
  const day = s.day === null ? '' : ` · Day ${String(s.day)}`;
  const lines = [
    `${s.prefix || 'EVENT'}${day} · ${stampClockText(s.at, s.timeZone)}`,
    s.source === 'camera' ? 'In-app camera' : 'Uploaded file · time of submission',
  ];
  // Only when there is something to say: a stamp that always read "clock OK"
  // would train the eye to skip the line that matters.
  if (s.clockOffsetMs === null) lines.push('Device clock unverified');
  else if (Math.abs(s.clockOffsetMs) > CLOCK_TOLERANCE_MS) {
    lines.push(`Device clock ${skewText(s.clockOffsetMs)} vs server`);
  }
  return lines;
}
