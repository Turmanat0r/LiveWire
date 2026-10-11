// A catch photo, ready to file: stamped, sized to the budget, and measured.
import { stampLines, type PhotoSource, type StampInput } from '../domain/capture';
import { analyzePhoto, type Precheck } from './analyze';
import { encodePhoto } from './encode';
import { freeze, loadImage, sourceSize, type PixelSource } from './pixels';

export interface CapturedPhoto {
  readonly blob: Blob;
  /** For the preview; revoke it when done with the photo. */
  readonly url: string;
  readonly source: PhotoSource;
  /** When the stamp says it was taken (camera) or filed (upload). */
  readonly at: number;
  readonly precheck: Precheck;
}

export async function preparePhoto(source: PixelSource, stamp: StampInput): Promise<CapturedPhoto> {
  const frame = freeze(source);
  const original = sourceSize(frame);
  const blob = await encodePhoto(frame, stampLines(stamp));
  // Measured as stored: the fingerprints have to match what the director sees.
  const stored = await loadImage(blob);
  const precheck = analyzePhoto(stored, original);
  return { blob, url: URL.createObjectURL(blob), source: stamp.source, at: stamp.at, precheck };
}

/** A photo picked from the camera roll, prepared the same way. */
export async function preparePickedPhoto(file: Blob, stamp: StampInput): Promise<CapturedPhoto> {
  return preparePhoto(await loadImage(file), stamp);
}
