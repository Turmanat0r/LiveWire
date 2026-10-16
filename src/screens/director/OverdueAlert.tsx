import { useOverdue } from '../../data/director';
import { ageText } from '../../domain/safety';
import { callHref } from '../safety/words';

/**
 * Above everything on the director's screen once the final check-in has
 * passed: who launched today and has not come back. It clears itself as each
 * one checks out. Loud on purpose: it should not be possible to scroll past.
 */
export function OverdueAlert({ now }: { readonly now: number }) {
  const overdue = useOverdue(now);
  if (!overdue) return null;
  const { minutes, rows } = overdue;
  return (
    <section className="overdue" role="alert" aria-label="Not checked out">
      <h2 className="overdue__head">
        {rows.length} {rows.length === 1 ? 'angler has' : 'anglers have'} not checked out
      </h2>
      <p className="overdue__sub">
        Final check-in was {minutes} minute{minutes === 1 ? '' : 's'} ago. Oldest position first.
      </p>
      <ul className="overdue__list">
        {rows.map((r) => (
          <li key={r.anglerId} className="overdue__row">
            <p className="overdue__name">
              {r.name} <span className="overdue__code">{r.code}</span>
            </p>
            <p className="overdue__line">
              {r.phone ? <a href={callHref(r.phone)}>{r.phone}</a> : 'No phone on file'}
            </p>
            <p className="overdue__line">
              {r.lastSeenAt === null ? (
                <strong>No position ever recorded</strong>
              ) : (
                `Last seen ${ageText(r.lastSeenAt, now)}${
                  r.lat !== null && r.lng !== null
                    ? ` · ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
                    : ''
                }`
              )}
            </p>
            <p className="overdue__ice">
              {r.emergencyPhone ? (
                <>
                  Emergency: {r.emergencyName || 'contact'} ·{' '}
                  <a href={callHref(r.emergencyPhone)}>{r.emergencyPhone}</a>
                </>
              ) : (
                'No emergency contact on file'
              )}
            </p>
          </li>
        ))}
      </ul>
      <p className="overdue__foot">This clears itself as each one checks out.</p>
    </section>
  );
}
