// The highlight reel: your own approved fish as a short vertical video to post.
// What goes in it, in what order, and for how long, the way the old app plans
// it; tests/parity runs both. Drawing and recording live with the screen.
//
// ONLY YOUR OWN FISH. Whether the field is happy to be on the gallery wall
// inside the app is a different question from whether they are happy to be in
// somebody's Instagram post, and only one of those did anyone agree to.
import { compareIds } from './scoring';
import type { DateKey } from './types';

/** 9:16, which is what reels and stories want. */
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
export const REEL_TITLE_MS = 1700;
export const REEL_SHOT_MS = 2200;
export const REEL_END_MS = 1900;
/** Twelve fish is about thirty seconds. Past that social apps cut it off mid-fish. */
export const REEL_MAX_SHOTS = 12;

export interface ReelCandidate {
  readonly id: string;
  readonly inches: number;
  readonly mine: boolean;
}

/** Your own fish, biggest first: a highlight reel opens with the fish you would open with. */
export function reelOrder<T extends ReelCandidate>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.mine).sort((a, b) => b.inches - a.inches || compareIds(a.id, b.id));
}

export type ReelScene<T> =
  | { readonly kind: 'title'; readonly ms: number }
  | { readonly kind: 'shot'; readonly ms: number; readonly row: T }
  | { readonly kind: 'end'; readonly ms: number };

export interface ReelPlan<T> {
  readonly scenes: readonly ReelScene<T>[];
  readonly shots: number;
  /** Fish left off so it does not run long. */
  readonly dropped: number;
  readonly totalMs: number;
}

export function reelPlan<T>(rows: readonly T[], maxShots = REEL_MAX_SHOTS): ReelPlan<T> {
  const shots = rows.slice(0, Math.max(0, maxShots));
  const scenes: ReelScene<T>[] = [
    { kind: 'title', ms: REEL_TITLE_MS },
    ...shots.map((row) => ({ kind: 'shot' as const, ms: REEL_SHOT_MS, row })),
    { kind: 'end', ms: REEL_END_MS },
  ];
  return {
    scenes,
    shots: shots.length,
    dropped: rows.length - shots.length,
    totalMs: scenes.reduce((t, s) => t + s.ms, 0),
  };
}

/** The scene on screen at `ms`, and how far through it; null past the end, so recording stops. */
export function sceneAt<T>(
  plan: ReelPlan<T>,
  ms: number,
): { readonly scene: ReelScene<T>; readonly index: number; readonly progress: number } | null {
  let start = 0;
  for (const [index, scene] of plan.scenes.entries()) {
    if (ms < start + scene.ms) return { scene, index, progress: (ms - start) / scene.ms };
    start += scene.ms;
  }
  return null;
}

/** "MKWO-2027-Salty-Bedrock-Perch-highlights.mp4": findable in a camera roll months later. */
export function reelFileName(
  prefix: string,
  dates: readonly DateKey[],
  handle: string,
  ext: string,
): string {
  const last = dates.at(-1);
  const bits = [
    prefix || 'LiveWire',
    ...(last === undefined ? [] : [last.slice(0, 4)]),
    ...(handle ? [handle] : []),
    'highlights',
  ];
  return `${bits
    .join('-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')}.${ext}`;
}

/**
 * MP4 first, deliberately. WebM records fine in Chrome and then will not
 * upload from a phone to most social apps, which makes a working recorder
 * useless at the only moment it matters. Safari records MP4 natively.
 */
export const REEL_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export function reelMimeType(isTypeSupported: (mime: string) => boolean): string {
  return REEL_TYPES.find((m) => isTypeSupported(m)) ?? '';
}

export function reelFileExt(mime: string): 'mp4' | 'webm' {
  return mime.includes('mp4') ? 'mp4' : 'webm';
}
