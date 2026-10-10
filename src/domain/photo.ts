// Photo fingerprints for duplicate detection. These are deterministic image
// measurements, not AI. The pixel reading lives in the camera feature; this is
// the arithmetic, so it can be tested without a canvas.
//
// Fingerprints are compared against catches from earlier events, so a change
// here that moves a hash by one bit quietly breaks duplicate detection across
// years. The parity tests hold it to the old app's output.

/** [x, y, width, height] as fractions of the source photo. */
export type FrameWindow = readonly [number, number, number, number];

/**
 * Every photo is hashed whole and through these windows, so a photo cropped to
 * look new still matches the original at the same framing. Index 0 must be the
 * whole frame: one side of every comparison is a whole photo.
 */
export const HASH_WINDOWS: readonly FrameWindow[] = [
  [0, 0, 1, 1],
  [0.075, 0.075, 0.85, 0.85],
  [0.15, 0.15, 0.7, 0.7],
  [0.225, 0.225, 0.55, 0.55],
  [0, 0, 0.75, 0.75],
  [0.25, 0, 0.75, 0.75],
  [0, 0.25, 0.75, 0.75],
  [0.25, 0.25, 0.75, 0.75],
];

export const DUPLICATE_MAX_BITS = 6;
/** A crop is less picture, so weaker evidence, so it has to match more closely. */
export const DUPLICATE_CROP_MAX_BITS = 4;

const HASH_W = 9;
const HASH_H = 8;

/**
 * Difference hash from a 9x8 greyscale grid: each pixel against its right-hand
 * neighbour, 64 bits, as 16 hex characters.
 */
export function dHashFromGrey(grey: ArrayLike<number>): string {
  let bits = '';
  for (let y = 0; y < HASH_H; y++) {
    for (let x = 0; x < HASH_W - 1; x++) {
      const here = grey[y * HASH_W + x] ?? 0;
      const right = grey[y * HASH_W + x + 1] ?? 0;
      bits += here > right ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Bits that differ between two hex hashes; 64 when they cannot be compared. */
export function hammingHex(a: string | undefined, b: string | undefined): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a.charAt(i), 16) ^ parseInt(b.charAt(i), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export interface HashMatch {
  readonly distance: number;
  /** True when the closest pair was a window against a whole photo. */
  readonly cropped: boolean;
}

/**
 * The closest pair of windows two photos have. One side of every comparison is
 * a whole frame: if B is a crop of A, B's whole frame matches one of A's
 * windows, and comparing narrow windows to each other only adds ways for two
 * featureless patches to collide.
 */
export function photoHashDistance(a: readonly string[], b: readonly string[]): HashMatch {
  const [aWhole] = a;
  const [bWhole] = b;
  if (aWhole === undefined || bWhole === undefined) return { distance: 64, cropped: false };
  let best = 64;
  let cropped = false;
  b.forEach((hash, j) => {
    const d = hammingHex(aWhole, hash);
    if (d < best) {
      best = d;
      cropped = j !== 0;
    }
  });
  a.forEach((hash, i) => {
    if (i === 0) return;
    const d = hammingHex(hash, bWhole);
    if (d < best) {
      best = d;
      cropped = true;
    }
  });
  return { distance: best, cropped };
}

export function isDuplicate(match: HashMatch): boolean {
  return match.distance <= (match.cropped ? DUPLICATE_CROP_MAX_BITS : DUPLICATE_MAX_BITS);
}
