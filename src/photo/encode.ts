// A catch photo as it is stored: a JPEG with the stamp burned into its corner,
// at the largest size that fits the budget.
import { context2d, sourceSize, type PixelSource } from './pixels';

/**
 * Sizes and qualities tried in turn, largest first: the old app's ladder. A
 * 1400px board photo is readable to the director; one bar of signal at the
 * ramp is the reason for the budget.
 */
const LADDER = [
  { dim: 1400, quality: 0.72 },
  { dim: 1100, quality: 0.68 },
  { dim: 900, quality: 0.62 },
  { dim: 820, quality: 0.56 },
  { dim: 760, quality: 0.5 },
  { dim: 680, quality: 0.44 },
  { dim: 600, quality: 0.38 },
  { dim: 520, quality: 0.32 },
] as const;

export const PHOTO_BUDGET_BYTES = 450_000;

const STAMP_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * Bottom left, sized off the photo so it reads the same at every rung of the
 * ladder; shrunk to fit rather than clipped. A dark band rather than a shadow:
 * it has to survive a photo of a photo.
 */
function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: readonly string[],
) {
  if (lines.length === 0) return;
  ctx.save();
  let size = Math.max(10, Math.round(Math.min(width, height) * 0.026));
  ctx.font = `600 ${String(size)}px ${STAMP_FONT}`;
  const widest = () => Math.max(...lines.map((line) => ctx.measureText(line).width));
  const room = width - Math.round(size * 0.55) * 2;
  const over = widest();
  if (over > room && over > 0) {
    size = Math.max(7, Math.floor(size * (room / over)));
    ctx.font = `600 ${String(size)}px ${STAMP_FONT}`;
  }
  const pad = Math.round(size * 0.55);
  const lead = Math.round(size * 1.32);
  const boxH = lead * lines.length + pad * 2 - (lead - size);
  const boxW = Math.min(width, widest() + pad * 2);
  const top = height - boxH;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.fillRect(0, top, boxW, boxH);
  ctx.fillStyle = '#ffffff';
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, top + pad + lead * i);
  });
  ctx.restore();
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('This browser could not save the photo.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

/** The photo, stamped, at the largest rung of the ladder that fits the budget. */
export async function encodePhoto(source: PixelSource, stamp: readonly string[]): Promise<Blob> {
  const { width: naturalW, height: naturalH } = sourceSize(source);
  const canvas = document.createElement('canvas');
  const ctx = context2d(canvas);
  // Past the ladder, smaller still: a frame that will not compress (noise, a
  // shot of a screen) must still be storable, never refused.
  const attempts: { dim: number; quality: number }[] = [...LADDER];
  let smaller: number = LADDER[LADDER.length - 1]?.dim ?? 520;
  while (smaller > 240) {
    smaller = Math.round(smaller * 0.8);
    attempts.push({ dim: smaller, quality: 0.3 });
  }
  let out: Blob | null = null;
  for (const { dim, quality } of attempts) {
    const scale = Math.min(1, dim / Math.max(naturalW, naturalH));
    canvas.width = Math.max(1, Math.round(naturalW * scale));
    canvas.height = Math.max(1, Math.round(naturalH * scale));
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    // Inside the loop: every rung starts from a blank canvas.
    drawStamp(ctx, canvas.width, canvas.height, stamp);
    out = await toJpeg(canvas, quality);
    if (out.size <= PHOTO_BUDGET_BYTES) return out;
  }
  if (!out) throw new Error('This browser could not save the photo.');
  return out;
}
