import { describe, expect, it } from 'vitest';
import {
  AUTO_CAPTURE,
  frameMotion,
  frameProblem,
  frameStats,
  skewText,
  stampLines,
  type StampInput,
} from './capture';

const flat = (value: number, n = 64 * 64) => new Float64Array(n).fill(value);

function checkerboard(w: number, h: number, dark: number, light: number) {
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = (x + y) % 2 ? light : dark;
  return out;
}

describe('a camera frame', () => {
  it('measures brightness, and finds no focus in a flat field', () => {
    expect(frameStats(flat(120), 64, 64)).toEqual({ brightness: 120, sharpness: 0 });
  });

  it('finds fine detail sharp', () => {
    const stats = frameStats(checkerboard(64, 64, 80, 160), 64, 64);
    expect(stats.brightness).toBe(120);
    expect(stats.sharpness).toBeGreaterThan(AUTO_CAPTURE.sharpMin);
  });

  it('measures how much moved between two samples', () => {
    expect(frameMotion(flat(100), flat(100))).toBe(0);
    expect(frameMotion(flat(100), flat(110))).toBe(10);
  });

  it('names the most useful problem first, or none when good to shoot', () => {
    const sharp = { brightness: 120, sharpness: 400 };
    expect(frameProblem({ ...sharp, brightness: 20 }, 0)).toBe('Too dark');
    expect(frameProblem({ ...sharp, brightness: 250 }, 0)).toBe('Too bright: cut the glare');
    expect(frameProblem(sharp, null)).toBe('Hold steady');
    expect(frameProblem(sharp, 9)).toBe('Hold steady');
    expect(frameProblem({ ...sharp, sharpness: 5 }, 0)).toBe('Focusing…');
    expect(frameProblem(sharp, 1)).toBeNull();
  });
});

describe('the photo stamp', () => {
  const base: StampInput = {
    prefix: 'MKWO',
    day: 1,
    at: Date.parse('2027-09-18T12:42:00Z'),
    timeZone: 'America/Denver',
    source: 'camera',
    clockOffsetMs: 30_000,
  };

  it('gives the event, the day and the time on the event clock', () => {
    expect(stampLines(base)).toEqual(['MKWO · Day 1 · 09/18/2027, 06:42 MDT', 'In-app camera']);
  });

  it('says when a photo was picked from the camera roll', () => {
    expect(stampLines({ ...base, source: 'upload', day: null })).toEqual([
      'MKWO · 09/18/2027, 06:42 MDT',
      'Uploaded file · time of submission',
    ]);
  });

  it('speaks up about the clock only when there is something to say', () => {
    expect(stampLines({ ...base, clockOffsetMs: null })).toContain('Device clock unverified');
    expect(stampLines({ ...base, clockOffsetMs: 12 * 60_000 })).toContain(
      'Device clock 12 min behind vs server',
    );
    expect(stampLines({ ...base, clockOffsetMs: -5 * 60_000 })).toContain(
      'Device clock 5 min ahead vs server',
    );
  });

  it('rounds the skew to whole minutes', () => {
    expect(skewText(20_000)).toBe('under a minute');
    expect(skewText(-61 * 60_000)).toBe('61 min ahead');
  });
});
