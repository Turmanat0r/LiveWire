import { Link } from 'react-router';
import { SCREENS } from '../app/screens';
import { MILESTONES } from '../app/milestones';
import { useSync } from '../data/useSync';
import { clockText, dateRangeText } from '../domain/time';
import { Card } from '../ui/Card';
import { Page } from '../ui/Page';
import './HomeScreen.css';

/** The tournament every phone is on, from the phone's own copy: it shows with no signal. */
function CurrentEvent() {
  const loaded = useSync((s) => s.loaded);
  const event = useSync((s) => s.event);
  const days = useSync((s) => s.tables.event_days);
  if (!loaded) return null;
  if (!event) {
    return (
      <Card title="No tournament yet">
        <p>The director has not opened one. It will appear here when they do.</p>
      </Card>
    );
  }
  const dates = [...days.values()]
    .filter((d) => d.event_id === event.id)
    .map((d) => d.day)
    .sort();
  return (
    <Card title={event.name}>
      <dl className="event-facts">
        {event.presenter ? (
          <div>
            <dt>Presented by</dt>
            <dd>{event.presenter}</dd>
          </div>
        ) : null}
        <div>
          <dt>Dates</dt>
          <dd>{dateRangeText(dates) || 'To be announced'}</dd>
        </div>
        <div>
          <dt>Fishing</dt>
          <dd>
            Lines in {clockText(event.lines_in)}, lines out {clockText(event.lines_out)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export function HomeScreen() {
  const others = SCREENS.filter((s) => s.id !== 'home');
  return (
    <Page title="LiveWire" kicker="Rebuild · sync and offline">
      <CurrentEvent />

      <Card title="What this is" tone="notice">
        <p>
          The new LiveWire, being built a stage at a time. It now reads the tournament from the
          server, keeps a copy for when there is no signal, and updates the moment anything changes.
          Filing catches comes next. The tournament still runs on the current app.
        </p>
      </Card>

      <nav aria-labelledby="home-screens">
        <h2 id="home-screens" className="visually-hidden">
          Every screen
        </h2>
        <ul className="tile-grid">
          {others.map((s) => (
            <li key={s.id}>
              <Link className="tile" to={s.path} data-theme={s.theme}>
                <span className="tile__title">{s.title}</span>
                <span className="tile__summary">{s.summary}</span>
                {s.milestone ? (
                  <span className="tile__status">
                    Stage {s.milestone}: {MILESTONES[s.milestone]}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Page>
  );
}
