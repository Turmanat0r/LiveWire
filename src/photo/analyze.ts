// What the phone measures about a photo before it is filed: brightness,
// focus, size, and fingerprints. Measurements, not judgements: the director's
// review screen weighs them (a soft photo, a duplicate of an earlier fish).
import { frameStats } from '../domain/capture';
import { dHashFromGrey, HASH_WINDOWS } from '../domain/photo';
import type { Json } from '../data/remote';
import { greyscale, sourceSize, type PixelSource } from './pixels';

export interface Precheck {
  /** The whole-frame fingerprint; also hashes[0]. */
  readonly hash: string;
  /** One fingerprint per window in HASH_WINDOWS, for spotting crops. */
  readonly hashes: readonly string[];
  readonly brightness: number;
  readonly sharpness: number;
  /** The original photo's size, before it was scaled to store. */
  readonly srcWidth: number;
  readonly srcHeight: number;
  readonly analyzedAt: number;
}

/** Measures the photo as stored. `original` is the size it was taken at. */
export function analyzePhoto(
  stored: PixelSource,
  original: { width: number; height: number },
): Precheck {
  const stats = frameStats(greyscale(stored, 64, 64), 64, 64);
  const hashes = HASH_WINDOWS.map((win) => dHashFromGrey(greyscale(stored, 9, 8, win)));
  const size = sourceSize(stored);
  return {
    hash: hashes[0] ?? '',
    hashes,
    brightness: Math.round(stats.brightness * 10) / 10,
    sharpness: Math.round(stats.sharpness * 10) / 10,
    srcWidth: original.width || size.width,
    srcHeight: original.height || size.height,
    analyzedAt: Date.now(),
  };
}

export function precheckJson(p: Precheck): Json {
  return { ...p, hashes: [...p.hashes] };
}
