import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { screen } from '../../app/screens';
import { useMyEntry } from '../../data/myEntry';
import { useSync } from '../../data/useSync';
import { Page } from '../../ui/Page';
import { CatchCard, PhotoThumb } from './CatchCard';
import { AnglerPick } from './MyCatchesScreen';
import '../../ui/forms.css';

/**
 * The CPR livewell: every scoring fish an angler has filed, longest first,
 * with the one that counts marked. Everything is released, so this is a
 * running tally, not fish in a tank.
 */
export function LivewellScreen() {
  const mine = useMyEntry();
  const event = useSync((s) => s.event);
  const catches = useSync((s) => s.tables.catches);
  const speciesRows = useSync((s) => s.tables.event_species);
  const [chosen, setChosen] = useState<string | null>(null);
  const title = screen('livewell').title;
  const anglerId = chosen ?? mine?.me.angler.id ?? '';

  const scoring = useMemo(
    () =>
      [...speciesRows.values()]
        .filter((s) => s.event_id === event?.id)
        .sort((a, b) => a.position - b.position)
        .map((s) => s.name),
    [speciesRows, event?.id],
  );
  const fish = useMemo(
    () =>
      [...catches.values()]
        .filter((c) => c.angler_id === anglerId && scoring.includes(c.species))
        .sort(
          (a, b) =>
            b.length_inches - a.length_inches ||
            a.logged_at.localeCompare(b.logged_at) ||
            a.id.localeCompare(b.id),
        ),
    [catches, anglerId, scoring],
  );

  if (!mine) {
    return (
      <Page title={title}>
        <p className="empty">Sign in to your entry to see your livewell.</p>
        <Link className="button button--secondary" to={screen('register').path}>
          Register
        </Link>
      </Page>
    );
  }
  const best = fish.find((c) => c.status === 'approved');
  const approved = fish.filter((c) => c.status === 'approved').length;
  const what = scoring.length ? scoring.join(' or ').toLowerCase() : 'scoring fish';
  return (
    <Page title={title}>
      <AnglerPick anglers={mine.anglers} value={anglerId} onChange={setChosen} />
      <p>
        Every approved catch is released on the water, so your livewell is a running tally rather
        than fish in a tank.
      </p>
      {fish.length === 0 ? (
        <p className="empty">No {what} submitted yet.</p>
      ) : (
        <>
          <p className="hint">
            {fish.length} filed · {approved} approved
          </p>
          <ul className="catch-list">
            {fish.map((c) => (
              <CatchCard
                key={c.id}
                photo={
                  <PhotoThumb
                    path={c.photo_path}
                    itemId={null}
                    alt={`${c.species}, ${String(c.length_inches)} inches`}
                  />
                }
                lengthInches={c.length_inches}
                status={c.status}
                title={c.species}
                best={c.id === best?.id}
              >
                {c.id === best?.id ? <span className="best-badge">Currently counts</span> : null}
              </CatchCard>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
