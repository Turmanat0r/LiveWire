import type { ActiveBeacon } from '../../data/beacons';
import { ageText } from '../../domain/safety';
import { useNow } from '../../app/useNow';
import '../../ui/beacon.css';

/** Every beacon that is up: this phone's own first, then the nearest. */
export function BeaconCards({ beacons }: { readonly beacons: readonly ActiveBeacon[] }) {
  const now = useNow();
  if (beacons.length === 0) return null;
  return (
    <ul className="beacon-cards" aria-label="Raised beacons">
      {beacons.map(({ beacon, handle, mine, miles, direction }) => {
        const where =
          miles !== null && direction
            ? `${miles.toFixed(2)} mi ${direction}`
            : 'Check your position to get a bearing';
        const raised = Date.parse(beacon.raised_at);
        const placed = Date.parse(beacon.position_at);
        return (
          <li key={beacon.id} className={mine ? 'beacon-card beacon-card--mine' : 'beacon-card'}>
            <p className="beacon-card__title">
              <span className="beacon-pulse" aria-hidden="true" />
              {mine ? 'Your beacon is up' : 'Beacon raised'}
            </p>
            <p className="beacon-card__row">
              <span className="beacon-card__who">{handle}</span>
              <span className="beacon-card__where">{mine ? ageText(placed, now) : where}</span>
            </p>
            {beacon.note ? <p className="beacon-card__note">“{beacon.note}”</p> : null}
            <p className="beacon-card__meta">
              {mine
                ? 'The director and the whole field can see you. Your position refreshes every minute while the app is open on screen. Stand it down when you are safe.'
                : `Raised ${ageText(raised, now)} · position ${ageText(placed, now)}`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
