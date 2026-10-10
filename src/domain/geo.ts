import type { LatLng } from './types';

// Everything here runs on the phone with no network. The reservoir has no
// signal: map tiles need one, knowing whether you are inside the line does not.

const EARTH_RADIUS_MILES = 3958.8;
export const MILES_PER_DEG_LAT = 69.0546;
export const METRES_PER_MILE = 1609.344;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance (haversine). */
export function milesBetween(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * The course. A circle is a launch point and a radius; a polygon is a
 * shoreline stretch traced on the map; "none" records where each fish was
 * caught without judging it.
 */
export type Boundary =
  | { readonly kind: 'none' }
  | { readonly kind: 'circle'; readonly center: LatLng; readonly radiusMiles: number }
  | { readonly kind: 'polygon'; readonly points: readonly LatLng[] };

export type UsableBoundary = Exclude<Boundary, { kind: 'none' }>;

export function boundaryIsUsable(b: Boundary): b is UsableBoundary {
  switch (b.kind) {
    case 'none':
      return false;
    case 'circle':
      return Number.isFinite(b.center.lat) && Number.isFinite(b.center.lng) && b.radiusMiles > 0;
    case 'polygon':
      return b.points.length >= 3;
  }
}

interface FlatPoint {
  readonly x: number;
  readonly y: number;
}

/** Flat-earth projection in miles. Over a course a few miles across the error is far below GPS noise. */
function projectMiles(p: LatLng, refLat: number): FlatPoint {
  return {
    x: p.lng * MILES_PER_DEG_LAT * Math.cos(toRad(refLat)),
    y: p.lat * MILES_PER_DEG_LAT,
  };
}

/** Each edge of a closed ring as [previous corner, this corner], starting with last-to-first. */
function ringEdges<T>(ring: readonly T[]): [T, T][] {
  const last = ring.at(-1);
  if (last === undefined) return [];
  let prev: T = last;
  return ring.map((cur) => {
    const edge: [T, T] = [prev, cur];
    prev = cur;
    return edge;
  });
}

/** Ray casting: count crossings of a ray heading east from the point. */
export function pointInPolygon(p: LatLng, points: readonly LatLng[]): boolean {
  let inside = false;
  for (const [pj, pi] of ringEdges(points)) {
    const straddles = pi.lat > p.lat !== pj.lat > p.lat;
    if (straddles && p.lng < ((pj.lng - pi.lng) * (p.lat - pi.lat)) / (pj.lat - pi.lat) + pi.lng) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(p: FlatPoint, a: FlatPoint, b: FlatPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  // A degenerate edge (two identical corners) is just a point.
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distanceToPolygonEdgeMiles(p: LatLng, points: readonly LatLng[]): number {
  if (points.length === 0) return Infinity;
  const refLat = points.reduce((sum, q) => sum + q.lat, 0) / points.length;
  const flat = projectMiles(p, refLat);
  const ring = points.map((q) => projectMiles(q, refLat));
  let best = Infinity;
  for (const [a, b] of ringEdges(ring)) best = Math.min(best, distanceToSegment(flat, a, b));
  return best;
}

/** The verdict stored on a catch, and the same one the angler sees live. */
export type BoundaryVerdict =
  | { readonly kind: 'unchecked' }
  | {
      readonly kind: 'circle';
      readonly within: boolean;
      readonly fromLaunchMiles: number;
      readonly outsideMiles: number;
    }
  | {
      readonly kind: 'polygon';
      readonly within: boolean;
      readonly edgeMiles: number;
      readonly outsideMiles: number;
    };

export function evaluateBoundary(p: LatLng, boundary: Boundary): BoundaryVerdict {
  if (!boundaryIsUsable(boundary)) return { kind: 'unchecked' };
  if (boundary.kind === 'circle') {
    const fromLaunchMiles = milesBetween(p, boundary.center);
    return {
      kind: 'circle',
      within: fromLaunchMiles <= boundary.radiusMiles,
      fromLaunchMiles,
      outsideMiles: Math.max(0, fromLaunchMiles - boundary.radiusMiles),
    };
  }
  const within = pointInPolygon(p, boundary.points);
  const edgeMiles = distanceToPolygonEdgeMiles(p, boundary.points);
  return { kind: 'polygon', within, edgeMiles, outsideMiles: within ? 0 : edgeMiles };
}

/** Walk `miles` from a point along a compass bearing in radians (0 = north). */
export function offsetLatLng(from: LatLng, miles: number, bearingRad: number): LatLng {
  return {
    lat: from.lat + (miles * Math.cos(bearingRad)) / MILES_PER_DEG_LAT,
    lng:
      from.lng + (miles * Math.sin(bearingRad)) / (MILES_PER_DEG_LAT * Math.cos(toRad(from.lat))),
  };
}

/** Bearing in radians from north, positive toward east. */
export function bearingFrom(from: LatLng, to: LatLng): number {
  const north = (to.lat - from.lat) * MILES_PER_DEG_LAT;
  const east = (to.lng - from.lng) * MILES_PER_DEG_LAT * Math.cos(toRad(from.lat));
  return Math.atan2(east, north);
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/** Eight-point heading: good enough to point a paddle at. */
export function compassFrom(from: LatLng, to: LatLng): CompassPoint {
  const deg = ((bearingFrom(from, to) * 180) / Math.PI + 360) % 360;
  return COMPASS_POINTS[Math.round(deg / 45) % 8] ?? 'N';
}

/** Where a map of the course should open. */
export function boundaryCenter(b: Boundary, fallback: LatLng): LatLng {
  if (b.kind === 'circle') return b.center;
  if (b.kind === 'polygon' && b.points.length > 0) {
    const n = b.points.length;
    return {
      lat: b.points.reduce((s, p) => s + p.lat, 0) / n,
      lng: b.points.reduce((s, p) => s + p.lng, 0) / n,
    };
  }
  return fallback;
}
