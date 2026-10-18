// Drawing and recording the highlight reel, on the phone: a canvas painted
// against the clock and recorded as it goes. Nothing is uploaded; the video
// exists only on this phone until its owner posts it.
import {
  REEL_FPS,
  REEL_HEIGHT as H,
  REEL_WIDTH as W,
  reelMimeType,
  reelPlan,
  sceneAt,
  type ReelPlan,
} from '../../domain/reel';
import { inchesText } from '../board/StandingsScreen';

export interface ReelShot {
  readonly id: string;
  readonly path: string;
  readonly species: string;
  readonly inches: number;
  readonly handle: string;
}

export interface ReelMeta {
  readonly eventName: string;
  readonly dateText: string;
  /** Whose reel it is, on the title card. */
  readonly handle: string;
}

export interface Reel {
  readonly blob: Blob;
  readonly mime: string;
  readonly plan: ReelPlan<ReelShot>;
}

// The old reel's colours: a dark water background, warm white, river green.
const BACKGROUND = '#0c1412';
const WHITE = '#f4f1e9';
const GREEN = '#9fd9bb';
const GREY = '#c8d3cc';
const DIM = '#6b7b74';
const DISPLAY = 'Oswald, Impact, sans-serif';
const BODY = 'Inter, system-ui, sans-serif';

/** Recording needs MediaRecorder and a canvas that can be filmed. */
export function reelSupported(): boolean {
  try {
    return 'MediaRecorder' in globalThis && 'captureStream' in document.createElement('canvas');
  } catch {
    return false;
  }
}

type Images = ReadonlyMap<string, HTMLImageElement>;

/**
 * A photo, fetched into a same-origin blob first: drawing a picture straight
 * from the photo store would taint the canvas, and a tainted canvas cannot be
 * recorded. A photo that will not load is left out: a missing shot is better
 * than no reel.
 */
async function loadImage(url: string): Promise<{ img: HTMLImageElement; href: string } | null> {
  let href = '';
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    href = URL.createObjectURL(await res.blob());
    const img = new Image();
    img.src = href;
    await img.decode();
    return { img, href };
  } catch {
    if (href) URL.revokeObjectURL(href);
    return null;
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  font: string,
  colour: string,
  align: CanvasTextAlign = 'left',
) {
  ctx.font = font;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  // Squeezed rather than cut off: a long event name still fits the frame.
  ctx.fillText(value, x, y, W - 128);
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export function paintFrame(
  ctx: CanvasRenderingContext2D,
  plan: ReelPlan<ReelShot>,
  ms: number,
  meta: ReelMeta,
  images: Images,
) {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, W, H);
  const at = sceneAt(plan, ms);
  if (!at) return;
  const { scene } = at;
  if (scene.kind !== 'shot') {
    const best = Math.max(0, ...plan.scenes.map((s) => (s.kind === 'shot' ? s.row.inches : 0)));
    const lines =
      scene.kind === 'title'
        ? [meta.eventName || 'Tournament', meta.dateText, meta.handle]
        : [
            `${String(plan.shots)} fish`,
            best > 0 ? `Best ${inchesText(best)}` : '',
            'Caught, photographed, released',
          ];
    const [first = '', second = '', third = ''] = lines;
    text(ctx, first, W / 2, H / 2 - 90, `700 78px ${DISPLAY}`, WHITE, 'center');
    if (second) text(ctx, second, W / 2, H / 2 + 10, `500 46px ${BODY}`, GREEN, 'center');
    if (third) text(ctx, third, W / 2, H / 2 + 96, `500 40px ${BODY}`, GREY, 'center');
    return;
  }
  // A fish. The photo behind, and a band across the bottom so the numbers
  // stay readable over whatever the water was doing that day.
  const img = images.get(scene.row.id);
  if (img) cover(ctx, img);
  else text(ctx, 'photo unavailable', W / 2, H / 2, `500 40px ${BODY}`, DIM, 'center');
  const bandTop = H - 300;
  const band = ctx.createLinearGradient(0, bandTop, 0, H);
  band.addColorStop(0, `${BACKGROUND}00`);
  band.addColorStop(1, `${BACKGROUND}e6`);
  ctx.fillStyle = band;
  ctx.fillRect(0, bandTop, W, 300);
  text(ctx, inchesText(scene.row.inches), 64, H - 150, `700 116px ${DISPLAY}`, WHITE);
  text(ctx, scene.row.species, 64, H - 86, `500 42px ${BODY}`, GREEN);
  text(ctx, scene.row.handle, W - 64, H - 86, `500 38px ${BODY}`, GREY, 'right');
}

/**
 * Makes the video. Every photo is fetched BEFORE recording starts, since a
 * fetch stalling halfway through would be recorded as a stall, and frames are
 * painted against the clock rather than counted, so a dropped frame shortens
 * nothing: the reel is the length it says it is.
 */
export async function buildReel(
  shots: readonly ReelShot[],
  meta: ReelMeta,
  photoUrl: (path: string) => Promise<string>,
  say: (message: string) => void,
): Promise<Reel> {
  const plan = reelPlan(shots);
  if (plan.shots === 0) throw new Error('There are no approved photos to use yet.');
  const images = new Map<string, HTMLImageElement>();
  const hrefs: string[] = [];
  const used = plan.scenes.flatMap((s) => (s.kind === 'shot' ? [s.row] : []));
  try {
    for (const [i, row] of used.entries()) {
      say(`Fetching photo ${String(i + 1)} of ${String(used.length)}…`);
      const got = await loadImage(await photoUrl(row.path)).catch(() => null);
      if (got) {
        images.set(row.id, got.img);
        hrefs.push(got.href);
      }
    }
    // The fonts the frames are lettered in, loaded before the first frame.
    try {
      await Promise.all([
        document.fonts.load(`700 78px ${DISPLAY}`),
        document.fonts.load(`500 46px ${BODY}`),
      ]);
    } catch {
      // Lettered in the fallback fonts instead.
    }

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the video.');
    paintFrame(ctx, plan, 0, meta, images);
    const mime = reelMimeType((m) => MediaRecorder.isTypeSupported(m));
    const stream = canvas.captureStream(REEL_FPS);
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        resolve();
      };
    });
    say('Recording… keep this screen open.');
    recorder.start();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const t = performance.now() - started;
        if (t >= plan.totalMs) {
          resolve();
          return;
        }
        paintFrame(ctx, plan, t, meta, images);
        requestAnimationFrame(step);
      };
      step();
    });
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    if (chunks.length === 0) throw new Error('The recorder produced nothing.');
    const type = recorder.mimeType || mime || 'video/webm';
    return { blob: new Blob(chunks, { type }), mime: type, plan };
  } finally {
    for (const href of hrefs) URL.revokeObjectURL(href);
  }
}
