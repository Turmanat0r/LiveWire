import { Link } from 'react-router';
import { SCREENS } from '../app/screens';
import { MILESTONES } from '../app/milestones';
import { Card } from '../ui/Card';
import { Page } from '../ui/Page';
import './HomeScreen.css';

export function HomeScreen() {
  const others = SCREENS.filter((s) => s.id !== 'home');
  return (
    <Page title="LiveWire" kicker="Rebuild · foundation">
      <Card title="What this is" tone="notice">
        <p>
          The new LiveWire, being built a stage at a time. It looks and moves like the finished app,
          but nothing here reads or saves tournament data yet. The tournament still runs on the
          current app.
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
