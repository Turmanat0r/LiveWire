// Reading pixels off a photo or a live camera frame, through a canvas.
import type { FrameWindow } from '../domain/photo';

export type PixelSource = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement;

/** The source's own size: a video's frame, an image's natural size. */
export function sourceSize(source: PixelSource): { width: number; height: number } {
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot draw a photo.');
  return ctx;
}

/**
 * The source scaled to w by h, as luminance from 0 to 255, row by row. `win`
 * takes part of the source, as fractions: [x, y, width, height].
 */
export function greyscale(
  source: PixelSource,
  w: number,
  h: number,
  win: FrameWindow = [0, 0, 1, 1],
): Float64Array {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = context2d(canvas);
  const { width, height } = sourceSize(source);
  const [x, y, ww, wh] = win;
  ctx.drawImage(source, width * x, height * y, width * ww, height * wh, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const grey = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] =
      0.299 * (data[i * 4] ?? 0) + 0.587 * (data[i * 4 + 1] ?? 0) + 0.114 * (data[i * 4 + 2] ?? 0);
  }
  return grey;
}

/** A picked file as an image, turned the right way up (browsers honour the camera's rotation tag). */
export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That photo could not be read.'));
    };
    img.src = url;
  });
}

/**
 * A live frame frozen at full size. Encoding may draw the photo several times
 * to fit the budget; from a video each draw would be a later frame.
 */
export function freeze(source: PixelSource): PixelSource {
  if (!(source instanceof HTMLVideoElement)) return source;
  const canvas = document.createElement('canvas');
  canvas.width = source.videoWidth;
  canvas.height = source.videoHeight;
  context2d(canvas).drawImage(source, 0, 0);
  return canvas;
}
