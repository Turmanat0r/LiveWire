import { lazy, Suspense, useMemo, useState } from 'react';
import { currentFix } from '../../app/location';
import { rememberFix, useLatestFix } from '../../app/position';
import type { ActiveBeacon } from '../../data/beacons';
import type { MyEntry } from '../../data/myEntry';
import { useSync, useSyncEngine } from '../../data/useSync';
import { boundaryIsUsable, type Boundary } from '../../domain/geo';
import { Card } from '../../ui/Card';
import { trustedOffset } from '../catch/filing';
import type { MapPin } from './CourseMap';
import { readout } from './words';
import '../../ui/map.css';

const CourseMap = lazy(() => import('./CourseMap'));

/** A position check waits longer than a catch does: here the fix is the point. */
const POSITION_FIX_MS = 12_000;

/**
 * In or out of the course, worked out on the phone from the course line, so
 * it works with no bars at all. The map is a nicety on top.
 */
export function WhereAmI({
  course,
  timeZone,
  mine,
  beacons,
  catches,
}: {
  readonly course: Boundary;
  readonly timeZone: string;
  readonly mine: MyEntry | null;
  readonly beacons: readonly ActiveBeacon[];
  readonly catches: readonly (MapPin & { readonly outside: boolean })[];
}) {
  const sync = useSyncEngine();
  const clock = useSync((s) => s.clock);
  const fix = useLatestFix();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const reading = readout(fix, course, timeZone);
  const pins = useMemo(
    () => beacons.map((b) => ({ lat: b.beacon.lat, lng: b.beacon.lng, label: b.handle })),
    [beacons],
  );

  async function check() {
    setBusy(true);
    setProblem(null);
    const found = await currentFix(POSITION_FIX_MS);
    setBusy(false);
    if (!found) {
      setProblem(
        'Could not get a location fix. Check that location is allowed for this app, and try again in the open.',
      );
      return;
    }
    const at = Date.now();
    rememberFix(found, at);
    // The fix is taken already, so telling the director costs nothing. Straight
    // to the server: a newer check will replace it anyway.
    if (mine) {
      sync
        .call('record_position', {
          p_angler_id: mine.me.angler.id,
          p_lat: found.lat,
          p_lng: found.lng,
          p_accuracy_miles: found.accuracyMiles,
          p_at: new Date(at + (trustedOffset(clock, at) ?? 0)).toISOString(),
        })
        .catch(() => undefined);
    }
  }

  return (
    <Card title="Where am I?">
      <p className="hint">
        {!boundaryIsUsable(course)
          ? 'The director has not set a course boundary for this event, so there is no line to check against. Your position is still shown.'
          : 'Check yourself against the course boundary before you launch, and any time you are not sure.'}{' '}
        {mine
          ? 'Your position goes to the director, never to other anglers.'
          : 'Nothing is sent: this phone is not registered.'}
      </p>
      {/* Read out when it changes; the screen's one status line is the sync line. */}
      <div className={`readout readout--${reading.tone}`} aria-live="polite">
        <strong>{reading.title}</strong>
        <span>{reading.detail}</span>
      </div>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button
        className="button button--secondary"
        type="button"
        disabled={busy}
        onClick={() => void check()}
      >
        {busy ? 'Finding…' : 'Check my position'}
      </button>
      <Suspense fallback={<div className="course-map course-map--waiting">Loading the map…</div>}>
        <CourseMap course={course} me={fix} beacons={pins} catches={catches} />
      </Suspense>
      <p className="hint">
        The map needs a signal, so it may not draw out on the water. The in/out reading above does
        not: it is worked out on your phone from the boundary, and works with no bars at all.
      </p>
    </Card>
  );
}
