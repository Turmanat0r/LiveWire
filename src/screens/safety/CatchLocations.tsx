import type { MyEntry } from '../../data/myEntry';
import type { Row } from '../../data/tables';
import { Card } from '../../ui/Card';
import { lengthText } from '../catches/CatchCard';
import type { Badge } from './words';

export interface CatchLocation {
  readonly id: string;
  readonly species: string;
  readonly lengthInches: number;
  readonly when: string;
  readonly status: Row<'catches'>['status'];
  readonly badge: Badge;
}

const STATUS: Record<Row<'catches'>['status'], string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Not accepted',
};

/**
 * Where each of this entry's catches was filed against the course. Only this
 * entry's: where anyone else fishes is theirs to know.
 */
export function CatchLocations({
  mine,
  rows,
}: {
  readonly mine: MyEntry | null;
  readonly rows: readonly CatchLocation[];
}) {
  const count = (tone: Badge['tone'], text?: string) =>
    rows.filter((r) => r.badge.tone === tone && (!text || r.badge.text === text)).length;
  return (
    <Card title="Your catch locations">
      {!mine ? (
        <p className="empty">Register on this device to see where your catches were filed.</p>
      ) : rows.length === 0 ? (
        <p className="empty">You have not submitted any catches yet.</p>
      ) : (
        <>
          <dl className="gps-summary">
            <div>
              <dt>In bounds</dt>
              <dd>{count('good')}</dd>
            </div>
            <div>
              <dt>Flagged</dt>
              <dd>{count('out')}</dd>
            </div>
            <div>
              <dt>No GPS</dt>
              <dd>{count('plain', 'Location unavailable')}</dd>
            </div>
          </dl>
          <ul className="rows" aria-label="Catches">
            {rows.map((r) => (
              <li key={r.id} className="gps-row">
                <p className="gps-row__top">
                  <span className="gps-row__name">{r.species}</span>
                  <span className="gps-row__meta">{lengthText(r.lengthInches)}</span>
                </p>
                <p className="gps-row__meta">
                  {r.when} · {STATUS[r.status]}
                </p>
                <span className={`loc-badge loc-badge--${r.badge.tone}`}>{r.badge.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
