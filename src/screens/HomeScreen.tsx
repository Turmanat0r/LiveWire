import { Link } from 'react-router';
import { useStatusLine } from '../app/SyncStatus';
import { useNow } from '../app/useNow';
import { screen, type ScreenId } from '../app/screens';
import { useSync } from '../data/useSync';
import { dateRangeText } from '../domain/time';
import { Icon } from '../ui/Icon';
import './HomeScreen.css';

type Accent = 'gold' | 'green' | 'steel' | 'amber' | 'olive';

interface Tile {
  readonly to: ScreenId;
  readonly label: string;
  readonly sub: string;
  readonly accent: Accent;
}

// The old home screen's quick-access tiles, in its order and with its words.
const ACTIONS: readonly Tile[] = [
  { to: 'check-in', label: 'Check In / Out', sub: 'Both event days', accent: 'gold' },
  { to: 'my-catches', label: 'Manage Catch', sub: 'Edit or withdraw', accent: 'green' },
  { to: 'livewell', label: 'CPR Livewell', sub: 'Your scoring fish', accent: 'steel' },
  { to: 'trophies', label: 'Trophy Case', sub: 'Bests, history, badges', accent: 'amber' },
  { to: 'gallery', label: 'Fish Gallery', sub: 'Every fish on the board', accent: 'amber' },
  { to: 'side-bets', label: 'Side Bets', sub: 'Big Fish & angler bets', accent: 'olive' },
];

const INFO: readonly Tile[] = [
  { to: 'safety', label: 'GPS Status', sub: 'Read only', accent: 'olive' },
  { to: 'payouts', label: 'Payouts', sub: 'Read only', accent: 'gold' },
];

/** The signal mark in the top bar: the same news as the status banner, at a glance. */
function SignalMark() {
  const { text, tone } = useStatusLine();
  return (
    <span className={`home-signal home-signal--${tone}`} role="img" aria-label={text} title={text}>
      <Icon name="signal" />
    </span>
  );
}

/** The faint fish drawn behind the event's name. */
function FishMark() {
  return (
    <svg className="home-fishmark" viewBox="0 0 260 150" aria-hidden="true" focusable="false">
      <path d="M28 78c34-42 102-58 158-28 20 11 34 25 48 28-14 4-28 18-48 29-56 30-124 14-158-29Z" />
      <path d="M28 78 6 48c3 22 3 38 0 60l22-30Z" />
      <path d="M89 43 116 17l20 27 24-18 15 24" />
      <path d="M92 110c14-18 33-22 49-10" />
      <path d="M187 65a4 4 0 1 0 8 0 4 4 0 1 0-8 0" />
      <path d="M199 91c12 2 23-2 35-13" />
      <path d="M69 58 163 86" />
    </svg>
  );
}

/** The tournament every phone is on, from the phone's own copy: it shows with no signal. */
function EventCard() {
  const loaded = useSync((s) => s.loaded);
  const event = useSync((s) => s.event);
  const days = useSync((s) => s.tables.event_days);
  const now = useNow();
  if (!loaded) return null;
  if (!event) {
    return (
      <section className="home-event" aria-labelledby="home-event-title">
        <FishMark />
        <h2 id="home-event-title" className="home-event__title">
          No tournament yet
        </h2>
        <p className="home-location">The director has not opened one. It will appear here.</p>
      </section>
    );
  }
  const dates = [...days.values()]
    .filter((d) => d.event_id === event.id)
    .map((d) => d.day)
    .sort();
  const open = Date.parse(event.registration_closes_at) > now;
  return (
    <section className="home-event" aria-labelledby="home-event-title">
      <div className="home-event__top">
        <span className={open ? 'home-live' : 'home-live home-live--closed'}>
          <span className="home-live__dot" aria-hidden="true" />
          {open ? 'Registration open' : 'Registration closed'}
        </span>
        <span className="home-event__date">{dateRangeText(dates)}</span>
      </div>
      <FishMark />
      {event.presenter ? <p className="home-kicker">{event.presenter} presents</p> : null}
      <h2 id="home-event-title" className="home-event__title">
        {event.name}
      </h2>
      {event.course_label ? (
        <p className="home-location">
          <Icon name="location" />
          <span>{event.course_label}</span>
        </p>
      ) : null}
      {open ? (
        <Link className="home-register" to={screen('register').path}>
          Register now
        </Link>
      ) : null}
    </section>
  );
}

function TileLink({ tile, info }: { readonly tile: Tile; readonly info?: boolean }) {
  const base = info ? 'home-info-tile' : 'home-tile';
  return (
    <Link className={`${base} home-accent--${tile.accent}`} to={screen(tile.to).path}>
      <Icon name={tile.to} />
      <span className="home-tile__copy">
        <span className="home-tile__label">{tile.label}</span>
        <span className="home-tile__sub">{tile.sub}</span>
      </span>
    </Link>
  );
}

export function HomeScreen() {
  return (
    <div className="home">
      <header className="home-topbar">
        <div className="home-brand">
          <span className="home-monogram" aria-hidden="true">
            LW
          </span>
          <div className="home-brand__copy">
            <h1 className="home-brand__name" tabIndex={-1} data-route-heading>
              LiveWire
            </h1>
            <span className="home-brand__tag">featuring Fish-I</span>
          </div>
        </div>
        <SignalMark />
      </header>

      <EventCard />

      <section className="home-profile" aria-labelledby="home-profile-label">
        <span className="home-avatar" aria-hidden="true">
          +
        </span>
        <div className="home-profile__copy">
          <h2 id="home-profile-label" className="home-profile__label">
            Angler profile
          </h2>
          <p className="home-profile__name">Not registered yet</p>
          <p className="home-profile__sub">Register above to receive your tournament ID</p>
        </div>
      </section>

      <nav aria-labelledby="home-more">
        <div className="home-sectionhead">
          <h2 id="home-more">More actions</h2>
          <span>Quick access</span>
        </div>
        <ul className="home-grid">
          {ACTIONS.map((tile) => (
            <li key={tile.to}>
              <TileLink tile={tile} />
            </li>
          ))}
        </ul>
        <ul className="home-info-grid" aria-label="Read-only tournament information">
          {INFO.map((tile) => (
            <li key={tile.to}>
              <TileLink tile={tile} info />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
