// A catch, as the outbox sends it: file the catch, then its photo, then (if
// asked) tell the field. The catch goes first because the photo store only
// accepts a photo for a pending catch that already exists; the announcement
// after it because it points at the catch. Last, the phone's position for the
// director: the fix is taken already, so it costs nothing.
import type { Fix } from '../../app/location';
import type { NewOutboxItem } from '../../data/local';
import type { Json } from '../../data/remote';
import type { PhotoSource } from '../../domain/capture';
import type { BoundaryVerdict } from '../../domain/geo';
import { precheckJson, type Precheck } from '../../photo/analyze';

export interface Filing {
  readonly catchId: string;
  readonly messageId: string;
  readonly eventId: string;
  readonly anglerId: string;
  /** The angler this phone is: the fix is where they are, whoever caught the fish. */
  readonly phoneAnglerId: string;
  readonly species: string;
  readonly lengthInches: number;
  /** When it was filed: every ranking breaks a tie on the earliest fish. */
  readonly loggedAt: number;
  readonly photo: {
    readonly at: number;
    readonly source: PhotoSource;
    readonly precheck: Precheck;
  };
  readonly clockOffsetMs: number | null;
  readonly fix: Fix | null;
  readonly boundary: BoundaryVerdict;
  readonly announce: boolean;
}

/** Where the photo lives; the database names it the same way (file_catch). */
export function photoPath(eventId: string, catchId: string): string {
  return `${eventId}/${catchId}.jpg`;
}

/** "Walleye, 21.5 in": what the outbox and My catches call it. */
export function catchLabel(species: string, lengthInches: number): string {
  return `${species}, ${String(lengthInches)} in`;
}

export function filingItem(f: Filing): NewOutboxItem {
  const iso = (ms: number) => new Date(ms).toISOString();
  const fileCatch: Readonly<Record<string, Json>> = {
    p_id: f.catchId,
    p_angler_id: f.anglerId,
    p_species: f.species,
    p_length_inches: f.lengthInches,
    p_logged_at: iso(f.loggedAt),
    p_captured_at: iso(f.photo.at),
    p_photo_source: f.photo.source,
    p_clock_offset_ms: f.clockOffsetMs,
    p_lat: f.fix?.lat ?? null,
    p_lng: f.fix?.lng ?? null,
    p_accuracy_miles: f.fix ? Math.round(f.fix.accuracyMiles * 1000) / 1000 : null,
    p_boundary: { ...f.boundary },
    p_precheck: precheckJson(f.photo.precheck),
  };
  return {
    id: f.catchId,
    label: catchLabel(f.species, f.lengthInches),
    createdAt: f.loggedAt,
    steps: [
      { kind: 'call', fn: 'file_catch', args: fileCatch },
      { kind: 'upload', path: photoPath(f.eventId, f.catchId), file: 'photo' },
      ...(f.announce
        ? [
            {
              kind: 'call' as const,
              fn: 'post_message' as const,
              args: {
                p_id: f.messageId,
                p_angler_id: f.anglerId,
                p_body: '',
                p_catch_id: f.catchId,
              },
            },
          ]
        : []),
      ...(f.fix
        ? [
            {
              kind: 'call' as const,
              fn: 'record_position' as const,
              args: {
                p_angler_id: f.phoneAnglerId,
                p_lat: f.fix.lat,
                p_lng: f.fix.lng,
                p_accuracy_miles: fileCatch['p_accuracy_miles'] ?? null,
                p_at: iso(f.loggedAt + (f.clockOffsetMs ?? 0)),
              },
            },
          ]
        : []),
    ],
  };
}

/** A length as typed: a number of inches the database will take, or null. */
export function parseLength(text: string): number | null {
  const n = Number(text.trim());
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
}

/** Clock readings older than a day are no longer worth printing on a photo. */
export function trustedOffset(
  clock: { offsetMs: number; measuredAt: number } | null,
  now: number,
): number | null {
  return clock && now - clock.measuredAt < 24 * 60 * 60_000 ? clock.offsetMs : null;
}
