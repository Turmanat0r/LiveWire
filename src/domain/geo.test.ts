import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  bearingFrom,
  boundaryIsUsable,
  compassFrom,
  evaluateBoundary,
  milesBetween,
  offsetLatLng,
  parseBoundary,
  type Boundary,
} from './geo';

const LAUNCH = { lat: 46.38917, lng: -111.57556 };
const circle: Boundary = { kind: 'circle', center: LAUNCH, radiusMiles: 4 };
// Roughly a 2-mile square around the launch.
const square: Boundary = {
  kind: 'polygon',
  points: [
    offsetLatLng(LAUNCH, Math.SQRT2, -Math.PI / 4),
    offsetLatLng(LAUNCH, Math.SQRT2, Math.PI / 4),
    offsetLatLng(LAUNCH, Math.SQRT2, (3 * Math.PI) / 4),
    offsetLatLng(LAUNCH, Math.SQRT2, (-3 * Math.PI) / 4),
  ],
};

describe('evaluateBoundary', () => {
  it('judges a circle by distance from the launch', () => {
    const inside = evaluateBoundary(offsetLatLng(LAUNCH, 3, 0), circle);
    const outside = evaluateBoundary(offsetLatLng(LAUNCH, 5, 0), circle);
    expect(inside).toMatchObject({ kind: 'circle', within: true, outsideMiles: 0 });
    expect(outside).toMatchObject({ kind: 'circle', within: false });
    if (outside.kind === 'circle') expect(outside.outsideMiles).toBeCloseTo(1, 2);
  });

  it('judges a polygon by containment, and says how far past the line', () => {
    expect(evaluateBoundary(LAUNCH, square)).toMatchObject({
      kind: 'polygon',
      within: true,
      outsideMiles: 0,
    });
    const out = evaluateBoundary(offsetLatLng(LAUNCH, 2, Math.PI / 2), square);
    expect(out).toMatchObject({ kind: 'polygon', within: false });
    if (out.kind === 'polygon') expect(out.outsideMiles).toBeCloseTo(1, 1);
  });

  it('records but does not judge when there is no usable course', () => {
    expect(evaluateBoundary(LAUNCH, { kind: 'none' })).toEqual({ kind: 'unchecked' });
    expect(evaluateBoundary(LAUNCH, { kind: 'polygon', points: [LAUNCH, LAUNCH] })).toEqual({
      kind: 'unchecked',
    });
    expect(boundaryIsUsable({ kind: 'circle', center: LAUNCH, radiusMiles: 0 })).toBe(false);
  });
});

describe('distance and direction', () => {
  it('walks out and measures back the same distance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 10_000 }),
        fc.integer({ min: -3141, max: 3141 }),
        (milli, bearingMilli) => {
          const miles = milli / 1000;
          const bearing = bearingMilli / 1000;
          const there = offsetLatLng(LAUNCH, miles, bearing);
          expect(milesBetween(LAUNCH, there)).toBeCloseTo(miles, 1);
        },
      ),
    );
  });

  it('points a paddle the right way', () => {
    expect(compassFrom(LAUNCH, offsetLatLng(LAUNCH, 1, 0))).toBe('N');
    expect(compassFrom(LAUNCH, offsetLatLng(LAUNCH, 1, Math.PI / 2))).toBe('E');
    expect(compassFrom(LAUNCH, offsetLatLng(LAUNCH, 1, (-3 * Math.PI) / 4))).toBe('SW');
    expect(bearingFrom(LAUNCH, offsetLatLng(LAUNCH, 1, 1))).toBeCloseTo(1, 3);
  });
});

describe('a course as stored', () => {
  it('reads a circle and a polygon', () => {
    expect(
      parseBoundary({ kind: 'circle', center: { lat: 46.4, lng: -111.6 }, radiusMiles: 4 }),
    ).toEqual({ kind: 'circle', center: { lat: 46.4, lng: -111.6 }, radiusMiles: 4 });
    const points = [
      { lat: 1, lng: 1 },
      { lat: 1, lng: 2 },
      { lat: 2, lng: 2 },
    ];
    expect(parseBoundary({ kind: 'polygon', points })).toEqual({ kind: 'polygon', points });
  });

  it('reads anything unexpected as no course at all', () => {
    expect(parseBoundary(null)).toEqual({ kind: 'none' });
    expect(parseBoundary({ kind: 'circle', center: { lat: 'x' }, radiusMiles: 4 })).toEqual({
      kind: 'none',
    });
    expect(parseBoundary({ kind: 'polygon', points: [{ lat: 1 }] })).toEqual({ kind: 'none' });
    expect(parseBoundary({ kind: 'hexagon' })).toEqual({ kind: 'none' });
  });
});
