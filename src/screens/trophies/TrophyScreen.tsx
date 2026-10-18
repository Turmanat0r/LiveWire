import { Link } from 'react-router';
import { screen } from '../../app/screens';
import { useTrophyCase } from '../../data/trophies';
import { trophyBadges, type TrophyRow, type TrophyStats } from '../../domain/trophies';
import { Card } from '../../ui/Card';
import { Page } from '../../ui/Page';
import { inchesText } from '../board/StandingsScreen';
import { placeName } from '../board/payouts';
import './trophies.css';

const NONE = '—';
const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <li className="trophy-stat">
      <span className="trophy-stat__value">{value}</span>
      <span className="trophy-stat__label">{label}</span>
      {sub ? <span className="trophy-stat__sub">{sub}</span> : null}
    </li>
  );
}

function Bests({ stats }: { readonly stats: TrophyStats }) {
  return (
    <ul className="trophy-stats" aria-label="Personal bests">
      <Stat
        value={stats.best > 0 ? inchesText(stats.best) : NONE}
        label="Personal best"
        {...(stats.longest ? { sub: stats.longest.species } : {})}
      />
      <Stat
        value={stats.bestTop3 > 0 ? inchesText(stats.bestTop3) : NONE}
        label="Best 3 combined"
        sub="in one tournament"
      />
      <Stat value={String(stats.fish)} label="Fish on the board" sub="approved, all time" />
      <Stat
        value={stats.bestDay > 0 ? String(stats.bestDay) : NONE}
        label="Best single day"
        sub="approved fish"
      />
      <Stat
        value={String(stats.events)}
        label="Tournaments"
        {...(stats.wins > 0 ? { sub: plural(stats.wins, 'win', 'wins') } : {})}
      />
      <Stat
        value={stats.bestPlacing > 0 ? placeName(stats.bestPlacing) : NONE}
        label="Best finish"
        {...(stats.podiums > 0 ? { sub: `${String(stats.podiums)} on the podium` } : {})}
      />
      <Stat
        value={String(stats.bigFishWins + stats.betsWon)}
        label="Pots and bets won"
        {...(stats.bigFishWins > 0 ? { sub: `${String(stats.bigFishWins)} Big Fish` } : {})}
      />
    </ul>
  );
}

/** The event's name, with its year when the name does not already say it. */
function eventTitle(row: TrophyRow): string {
  return row.year && !row.name.includes(row.year) ? `${row.name} ${row.year}` : row.name;
}

function HistoryRow({ row }: { readonly row: TrophyRow }) {
  // The handle carried that year comes first: it is what the board called you
  // at the time, and an angler looking back remembers the name.
  const bits = [
    `as ${row.handle}`,
    row.division === 'team' ? 'Team' : 'Solo',
    plural(row.fish, 'fish', 'fish'),
    ...(row.best > 0 ? [`best ${inchesText(row.best)}`] : []),
    ...(row.disqualified ? ['disqualified'] : []),
  ];
  const won = [
    ...(row.bigFishWon ? ['🏅 Big Fish pot'] : []),
    ...row.betsWon.map((title) => `🤝 ${title}`),
  ];
  const placed = !row.disqualified && row.placing > 0;
  return (
    <li
      className={
        placed && row.placing === 1
          ? 'trophy-history__row trophy-history__row--won'
          : 'trophy-history__row'
      }
    >
      <span className="trophy-history__main">
        <span className="trophy-history__name">{eventTitle(row)}</span>
        <span className="trophy-history__sub">{bits.join(' · ')}</span>
        {won.length > 0 ? <span className="trophy-history__won">{won.join(' · ')}</span> : null}
      </span>
      <span className="trophy-history__place">
        <span className="trophy-history__pl">{placed ? placeName(row.placing) : NONE}</span>
        <span className="trophy-history__pl-sub">
          {row.disqualified ? 'no placing' : placed ? `of ${String(row.entrants)}` : 'unranked'}
        </span>
      </span>
    </li>
  );
}

function History({
  stats,
  past,
}: {
  readonly stats: TrophyStats;
  readonly past: 'reading' | 'read' | 'offline';
}) {
  return (
    <Card title="Tournament history">
      {stats.history.length === 0 ? (
        <p className="empty">
          No tournaments yet. Your first one shows up here once you have registered.
        </p>
      ) : (
        <ul className="trophy-history" aria-label="Tournaments fished">
          {stats.history.map((r) => (
            <HistoryRow key={r.eventId} row={r} />
          ))}
        </ul>
      )}
      {past === 'reading' ? (
        <p className="hint">Looking up your earlier tournaments…</p>
      ) : past === 'offline' ? (
        <p className="hint">
          Earlier tournaments need signal to look up. Everything from this one is here.
        </p>
      ) : null}
    </Card>
  );
}

function Badges({ stats }: { readonly stats: TrophyStats }) {
  const badges = trophyBadges(stats);
  const earned = badges.filter((b) => b.earned).length;
  return (
    <Card title="Badges">
      <p className="hint">
        {String(earned)} of {String(badges.length)} earned. Everything here is worked out from the
        record, so it can always be explained.
      </p>
      {/* Unearned badges stay on the wall, greyed, with what it takes: an
          empty space says nothing about what there is to aim at. */}
      <ul className="trophy-badges" aria-label="Badges">
        {badges.map((b) => (
          <li
            key={b.id}
            className={b.earned ? 'trophy-badge' : 'trophy-badge trophy-badge--locked'}
          >
            <span className="trophy-badge__icon" aria-hidden="true">
              {b.icon}
            </span>
            <span className="trophy-badge__name">{b.name}</span>
            <span className="trophy-badge__status">{b.earned ? 'Earned' : b.need}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * The old app's trophy case: personal bests, a line for every tournament
 * fished, and the badges. Placings come from the frozen result wherever the
 * director has frozen one, so what an angler was told on the day stays what
 * it says here.
 */
export function TrophyScreen() {
  const { stats, anyEntry, past } = useTrophyCase();
  const title = screen('trophies').title;

  if (!anyEntry && past !== 'reading') {
    return (
      <Page title={title}>
        <p className="empty">
          This phone is not signed in to an entry, so there is nothing to show yet. Register for the
          tournament, or bring your entry onto this phone under “Already registered?”.
        </p>
        {past === 'offline' ? (
          <p className="hint">Earlier tournaments need signal to look up.</p>
        ) : null}
        <Link className="button button--secondary" to={screen('register').path}>
          Register
        </Link>
      </Page>
    );
  }
  return (
    <Page
      title={title}
      after={
        <>
          <History stats={stats} past={past} />
          <Badges stats={stats} />
        </>
      }
    >
      <p className="hint">
        {stats.fish === 0
          ? 'Nothing on the board yet. Everything here fills in as the director approves your catches.'
          : 'Worked out from every catch of yours the director has approved, across every tournament this app has a record of.'}
      </p>
      <Bests stats={stats} />
    </Page>
  );
}
