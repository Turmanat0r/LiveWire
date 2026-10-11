import { Link } from 'react-router';
import { useStatusLine } from '../app/SyncStatus';
import { useNow } from '../app/useNow';
import { screen, type ScreenId } from '../app/screens';
import { useMyEntry, type MyEntry } from '../data/myEntry';
import { useEventDates } from '../data/selectors';
import type { Row } from '../data/tables';
import { useSync } from '../data/useSync';
import { entryNumberText } from '../domain/identity';
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

/** The tournament every phone is on, from the phone's own copy: it shows with no signal. */
function EventCard({ registered }: { readonly registered: boolean }) {
  const loaded = useSync((s) => s.loaded);
  const event = useSync((s) => s.event);
  const dates = useEventDates(event);
  const now = useNow();
  if (!loaded) return null;
  if (!event) {
    return (
      <section className="home-event" aria-labelledby="home-event-title">
        <h2 id="home-event-title" className="home-event__title">
          No tournament yet
        </h2>
        <p className="home-location">The director has not opened one. It will appear here.</p>
      </section>
    );
  }
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
      <Link className="home-register" to={screen('register').path}>
        {registered ? 'Registration details' : open ? 'Register now' : 'View roster'}
      </Link>
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

/** "DT" for Daniel Turman. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '+';
}

/**
 * The angler card: who this phone is. Everything on it is the angler's own,
 * so their real name and both board codes belong here: it is the quickest
 * thing to reach on the water when someone forgets what to write on the board.
 */
function AnglerCard({
  mine,
  event,
}: {
  readonly mine: MyEntry | null;
  readonly event: Row<'events'> | null;
}) {
  if (!mine || !event) {
    return (
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
    );
  }
  const { me, partner, details, entry } = mine;
  const name = me.details?.full_name ?? me.angler.handle;
  const division = partner
    ? `Team with ${partner.details?.full_name ?? partner.angler.handle}`
    : 'Solo division';
  // Each piece wraps whole, so a code is never split from its label.
  const codes = [
    entryNumberText(event.entry_prefix, entry.entry_number),
    details?.team_code ? `Team ${details.team_code}` : null,
    me.details?.angler_code ? `Tournament ID ${me.details.angler_code}` : null,
  ].filter((piece): piece is string => piece !== null);
  return (
    <section className="home-profile" aria-labelledby="home-profile-label">
      <span className="home-avatar" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="home-profile__copy">
        <h2 id="home-profile-label" className="home-profile__label">
          Angler profile
          {details?.fee_paid ? null : <span className="home-profile__flag">Fee not matched</span>}
        </h2>
        <p className="home-profile__name">{name}</p>
        <p className="home-profile__sub">
          {me.angler.handle} · {division}
        </p>
        <p className="home-profile__sub">
          {codes.map((piece, i) => (
            <span className="home-profile__piece" key={piece}>
              {i > 0 ? ' · ' : ''}
              {piece}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

export function HomeScreen() {
  const mine = useMyEntry();
  const event = useSync((s) => s.event);
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

      <EventCard registered={mine !== null} />

      <AnglerCard mine={mine} event={event} />

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
