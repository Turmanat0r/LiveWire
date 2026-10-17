// The course boundary editor's rules: a draft the director shapes on the map
// or by typing, checked before it is sent, and what changing it does to the
// in-or-out reading of catches already filed.
import type { Row } from '../../data/tables';
import {
  boundaryIsUsable,
  evaluateBoundary,
  parseVerdict,
  type Boundary,
  type BoundaryVerdict,
} from '../../domain/geo';
import type { LatLng } from '../../domain/types';

export type BoundaryKind = Boundary['kind'];

/**
 * Every mode's shape at once, so switching between circle and outline and
 * back loses neither. Only the one the mode names is saved.
 */
export interface BoundaryDraft {
  readonly kind: BoundaryKind;
  readonly center: LatLng | null;
  readonly radiusMiles: number;
  readonly points: readonly LatLng[];
}

/** Five decimal places: about a metre, and what the old app kept. */
export function round5(n: number): number {
  return Math.round(n * 100_000) / 100_000;
}

export function roundPoint(p: LatLng): LatLng {
  return { lat: round5(p.lat), lng: round5(p.lng) };
}

export function draftFrom(b: Boundary): BoundaryDraft {
  switch (b.kind) {
    case 'none':
      return { kind: 'none', center: null, radiusMiles: 1, points: [] };
    case 'circle':
      return { kind: 'circle', center: b.center, radiusMiles: b.radiusMiles, points: [] };
    case 'polygon':
      return { kind: 'polygon', center: null, radiusMiles: 1, points: b.points };
  }
}

/** A tap on the map: the launch point of a circle, or the next corner of an outline. */
export function tapped(d: BoundaryDraft, at: LatLng): BoundaryDraft {
  const p = roundPoint(at);
  if (d.kind === 'circle')
    return { ...d, center: p, radiusMiles: d.radiusMiles > 0 ? d.radiusMiles : 1 };
  if (d.kind === 'polygon') return { ...d, points: [...d.points, p] };
  return d;
}

/** "46.41200, -111.60100" per line, the way the old app took them. */
export function pointLines(points: readonly LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`).join('\n');
}

export function parsePointLines(text: string): LatLng[] {
  const out: LatLng[] = [];
  for (const line of text.split('\n')) {
    const [lat, lng] = line
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
      out.push({ lat, lng });
    }
  }
  return out;
}

const real = (p: LatLng) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;

export type CheckedBoundary =
  | { readonly ok: true; readonly boundary: Boundary }
  | { readonly ok: false; readonly problem: string };

/** The draft as the course to save, or what is wrong with it: the old app's words. */
export function checkDraft(d: BoundaryDraft): CheckedBoundary {
  if (d.kind === 'none') return { ok: true, boundary: { kind: 'none' } };
  if (d.kind === 'circle') {
    if (!d.center || !Number.isFinite(d.center.lat) || !Number.isFinite(d.center.lng)) {
      return {
        ok: false,
        problem:
          'Set a centre first: tap the map, use your location, or type a latitude and longitude.',
      };
    }
    if (!real(d.center)) {
      return {
        ok: false,
        problem: 'That is not a real position. Latitude runs -90 to 90, longitude -180 to 180.',
      };
    }
    if (!(d.radiusMiles > 0)) return { ok: false, problem: 'Give the circle a radius in miles.' };
    return {
      ok: true,
      boundary: { kind: 'circle', center: roundPoint(d.center), radiusMiles: d.radiusMiles },
    };
  }
  if (!d.points.every(real)) {
    return {
      ok: false,
      problem:
        'One of those corners is not a real position. Latitude runs -90 to 90, longitude -180 to 180.',
    };
  }
  if (d.points.length < 3) {
    return {
      ok: false,
      problem: 'An outline needs at least three corners. Tap the map to add them.',
    };
  }
  return { ok: true, boundary: { kind: 'polygon', points: d.points.map(roundPoint) } };
}

/** "4 mile circle around 46.3892, -111.5756", "5-corner outline", "No boundary". */
export function describeBoundary(b: Boundary): string {
  if (!boundaryIsUsable(b)) return 'No boundary';
  if (b.kind === 'circle') {
    return `${String(b.radiusMiles)} mile circle around ${b.center.lat.toFixed(4)}, ${b.center.lng.toFixed(4)}`;
  }
  return `${String(b.points.length)}-corner outline`;
}

export function sameBoundary(a: Boundary, b: Boundary): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A verdict as it is stored: miles to three places. */
function storedVerdict(v: BoundaryVerdict): BoundaryVerdict {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  switch (v.kind) {
    case 'unchecked':
      return v;
    case 'circle':
      return { ...v, fromLaunchMiles: r(v.fromLaunchMiles), outsideMiles: r(v.outsideMiles) };
    case 'polygon':
      return { ...v, edgeMiles: r(v.edgeMiles), outsideMiles: r(v.outsideMiles) };
  }
}

const inOrOut = (v: BoundaryVerdict | null) =>
  v === null || v.kind === 'unchecked' ? 'unchecked' : v.within ? 'in' : 'out';

export interface Recheck {
  /** Catches with a position to judge. */
  readonly located: number;
  /** Every catch whose stored reading differs from the course now, with its new one. */
  readonly updates: readonly { readonly catchId: string; readonly verdict: BoundaryVerdict }[];
  /** How many of those flip in or out, which is what the director needs to know. */
  readonly flips: number;
}

/**
 * Each catch was judged against the course in force when it was filed. This
 * judges every one with a stored position against the course now. Nothing
 * else about a catch changes.
 */
export function recheck(
  evidence: Iterable<Row<'catch_evidence'>>,
  eventId: string,
  course: Boundary,
): Recheck {
  const updates: { catchId: string; verdict: BoundaryVerdict }[] = [];
  let located = 0;
  let flips = 0;
  for (const e of evidence) {
    if (e.event_id !== eventId || e.lat === null || e.lng === null) continue;
    located += 1;
    const now = storedVerdict(evaluateBoundary({ lat: e.lat, lng: e.lng }, course));
    const was = parseVerdict(e.boundary);
    if (was && JSON.stringify(storedVerdict(was)) === JSON.stringify(now)) continue;
    updates.push({ catchId: e.catch_id, verdict: now });
    if (inOrOut(was) !== inOrOut(now)) flips += 1;
  }
  return { located, updates, flips };
}
