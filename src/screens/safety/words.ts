// What the safety screen says: the in/out reading, a catch's location badge,
// and the text an angler in trouble sends the director.
import {
  boundaryIsUsable,
  evaluateBoundary,
  type Boundary,
  type BoundaryVerdict,
} from '../../domain/geo';
import type { LatLng } from '../../domain/types';
import { timeOfDayText } from '../../domain/time';
import type { TimedFix } from '../../app/location';

const FEET_PER_MILE = 5280;

export interface Readout {
  readonly tone: 'in' | 'out' | 'plain';
  readonly title: string;
  readonly detail: string;
}

function accuracyText(miles: number): string {
  return miles > 0 ? `±${(miles * FEET_PER_MILE).toFixed(0)} ft` : '';
}

/** 46.38917, -111.57556 */
export function coordsText(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

/**
 * "Where am I?" for a fix: in or out, and by how much. Worked out on the phone
 * from the course, so it needs no signal.
 */
export function readout(fix: TimedFix | null, course: Boundary, timeZone: string): Readout {
  const usable = boundaryIsUsable(course);
  if (!fix) {
    return {
      tone: 'plain',
      title: 'Not checked yet',
      detail: usable ? 'Tap below for a fix' : 'No boundary set for this event',
    };
  }
  const where = [coordsText(fix), timeOfDayText(fix.at, timeZone), accuracyText(fix.accuracyMiles)]
    .filter(Boolean)
    .join(' · ');
  const verdict = evaluateBoundary(fix, course);
  if (verdict.kind === 'unchecked') {
    return { tone: 'plain', title: 'Position recorded', detail: `${where} · No boundary set` };
  }
  if (verdict.within) {
    // Inside, the useful number is how much room is left before the line.
    const room =
      verdict.kind === 'polygon'
        ? verdict.edgeMiles
        : course.kind === 'circle'
          ? course.radiusMiles - verdict.fromLaunchMiles
          : null;
    const roomText =
      room !== null && Number.isFinite(room)
        ? `${room.toFixed(2)} mi inside the line`
        : 'Inside the course boundary';
    return { tone: 'in', title: 'In bounds', detail: `${roomText} · ${where}` };
  }
  return {
    tone: 'out',
    title: 'Outside the line',
    detail: `${verdict.outsideMiles.toFixed(2)} mi past the boundary · ${where}`,
  };
}

/** A course verdict as stored with a catch, read defensively. */
export function parseVerdict(value: unknown): BoundaryVerdict | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v['kind'] === 'unchecked') return { kind: 'unchecked' };
  const within = v['within'];
  const outsideMiles = typeof v['outsideMiles'] === 'number' ? v['outsideMiles'] : 0;
  if (typeof within !== 'boolean') return null;
  if (v['kind'] === 'circle' && typeof v['fromLaunchMiles'] === 'number') {
    return { kind: 'circle', within, fromLaunchMiles: v['fromLaunchMiles'], outsideMiles };
  }
  if (v['kind'] === 'polygon' && typeof v['edgeMiles'] === 'number') {
    return { kind: 'polygon', within, edgeMiles: v['edgeMiles'], outsideMiles };
  }
  return null;
}

export interface Badge {
  readonly tone: 'good' | 'out' | 'plain';
  readonly text: string;
}

/** Where a catch was filed against the course, in the old app's words. */
export function locationBadge(hasPosition: boolean, verdict: BoundaryVerdict | null): Badge {
  if (!hasPosition) return { tone: 'plain', text: 'Location unavailable' };
  if (!verdict || verdict.kind === 'unchecked') {
    return { tone: 'plain', text: 'Location recorded · no boundary set' };
  }
  const fromLaunch =
    verdict.kind === 'circle' ? ` · ${verdict.fromLaunchMiles.toFixed(1)} mi from launch` : '';
  if (verdict.within) return { tone: 'good', text: `In bounds${fromLaunch}` };
  const out =
    verdict.outsideMiles > 0
      ? ` · ${verdict.outsideMiles.toFixed(1)} mi outside the line`
      : fromLaunch;
  return { tone: 'out', text: `Outside course boundary${out}` };
}

/**
 * The text to the director, with the position filled in. A text often gets
 * out on a bar of signal that data cannot use.
 */
export function helpMessage(
  name: string,
  note: string,
  fix: TimedFix | null,
  timeZone: string,
): string {
  const said = note.trim() ? ` "${note.trim()}"` : '';
  if (!fix) return `LiveWire: ${name} needs help.${said} No GPS fix yet.`;
  const acc = accuracyText(fix.accuracyMiles);
  const map = `https://www.google.com/maps?q=${fix.lat.toFixed(5)},${fix.lng.toFixed(5)}`;
  return (
    `LiveWire: ${name} needs help.${said} At ${coordsText(fix)}` +
    `${acc ? ` (${acc})` : ''} as of ${timeOfDayText(fix.at, timeZone)}. ${map}`
  );
}

/**
 * A link that opens the phone's messages with the text written. Every entrant
 * dials a North American number. "?&body=" is the form both iPhone and
 * Android read.
 */
export function textHref(phone: string, body: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return `sms:+1${digits}?&body=${encodeURIComponent(body)}`;
}

/** tel: for a number as the director typed it. */
export function callHref(phone: string): string {
  return `tel:+1${phone.replace(/\D/g, '').slice(-10)}`;
}

/** "Sep 18, 10:42 AM", on the event's clock. */
export function whenText(at: number, timeZone: string): string {
  return new Date(at).toLocaleString('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
