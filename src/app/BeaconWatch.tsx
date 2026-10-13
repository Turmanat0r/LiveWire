import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { useActiveBeacons, useMyBeacon } from '../data/beacons';
import { useSync, useSyncEngine } from '../data/useSync';
import { trustedOffset } from '../screens/catch/filing';
import { currentFix } from './location';
import { rememberFix, useLatestFix } from './position';
import { screen } from './screens';
import '../ui/beacon.css';

/** While a beacon is up, how often its position is taken again. */
export const BEACON_REFRESH_MS = 60_000;
/** A beacon waits longer for a fix than a catch does: here the fix is the point. */
export const BEACON_FIX_MS = 20_000;

/**
 * Everywhere else the app takes a fix only when it already needs one, to
 * save the battery. A raised beacon flips that: someone is coming to find
 * you, and a position that stopped twenty minutes ago sends them to the
 * wrong water. So while it is up, and only then, the fix is taken again every
 * minute for as long as the app is open. It goes straight to the server: if
 * there is no signal, the next minute's fix is worth more than this one.
 */
function useBeaconTracking(): void {
  const sync = useSyncEngine();
  const { phase, anglerId } = useMyBeacon();
  const clock = useSync((s) => s.clock);
  const tracking = phase === 'up' || phase === 'raising';

  useEffect(() => {
    if (!tracking || !anglerId) return;
    let alive = true;
    const tick = async () => {
      const fix = await currentFix(BEACON_FIX_MS);
      if (!alive || !fix) return;
      const at = Date.now();
      rememberFix(fix, at);
      sync
        .call('record_position', {
          p_angler_id: anglerId,
          p_lat: fix.lat,
          p_lng: fix.lng,
          p_accuracy_miles: fix.accuracyMiles,
          p_at: new Date(at + (trustedOffset(clock, at) ?? 0)).toISOString(),
        })
        .catch(() => undefined);
    };
    const timer = setInterval(() => void tick(), BEACON_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [sync, tracking, anglerId, clock]);
}

/**
 * Keeps a raised beacon's position fresh, and puts every beacon in front of
 * the whole field on every screen: nobody should have to be on the safety
 * screen to learn that someone nearby needs help.
 */
export function BeaconWatch() {
  useBeaconTracking();
  const { pathname } = useLocation();
  const fix = useLatestFix();
  const beacons = useActiveBeacons(fix);
  const safety = screen('safety').path;
  if (pathname === safety || beacons.length === 0) return null;
  const others = beacons.filter((b) => !b.mine);
  const mine = beacons.find((b) => b.mine);
  const [nearest] = others;
  return (
    <>
      {nearest ? (
        <div className="beacon-banner" role="alert">
          <span className="beacon-pulse" aria-hidden="true" />
          <Link className="beacon-banner__link" to={safety}>
            <strong>Beacon raised</strong>
            <span>
              {nearest.handle} needs help
              {nearest.miles !== null && nearest.direction
                ? ` · ${nearest.miles.toFixed(2)} mi ${nearest.direction}`
                : ''}
              {others.length > 1 ? ` · ${String(others.length - 1)} more` : ''}
            </span>
          </Link>
        </div>
      ) : null}
      {mine ? (
        <div className="beacon-banner beacon-banner--mine">
          <span className="beacon-pulse" aria-hidden="true" />
          <Link className="beacon-banner__link" to={safety}>
            <strong>Your beacon is up</strong>
            <span>Stand it down on Safety when you are safe.</span>
          </Link>
        </div>
      ) : null}
    </>
  );
}
