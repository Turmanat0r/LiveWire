import { useId, useState } from 'react';
import { screen } from '../../app/screens';
import { useBoard } from '../../data/board';
import { useMyEntry } from '../../data/myEntry';
import { newBetProblem, useBetViews, type BetView } from '../../data/sideBets';
import { useSync, useSyncEngine } from '../../data/useSync';
import type { BetLeader, BetScoring } from '../../domain/bets';
import { timeOfDayText } from '../../domain/time';
import { Card } from '../../ui/Card';
import { Page } from '../../ui/Page';
import { BigFishList, bigFishNote } from './BigFishScreen';
import { inchesText } from './StandingsScreen';
import '../../ui/forms.css';
import './board.css';
import './bets.css';

const SCORING: readonly { readonly value: BetScoring; readonly label: string }[] = [
  { value: 'smallest', label: 'Smallest approved fish' },
  { value: 'most', label: 'Most approved fish' },
  { value: 'first', label: 'First approved fish' },
  { value: 'manual', label: 'I’ll decide myself' },
];

function leaderDetail(leader: BetLeader, timeZone: string): string {
  switch (leader.scoring) {
    case 'most':
      return `${String(leader.fishCount)} approved fish${leader.gotThereFirst ? ', got there first' : ''}`;
    case 'first':
      return `at ${timeOfDayText(leader.at, timeZone)}`;
    case 'smallest':
      return inchesText(leader.lengthInches);
  }
}

/**
 * Bets anglers run among themselves, under the Big Fish pot as in the old
 * app. The app keeps score, never money.
 */
export function SideBetsScreen() {
  const board = useBoard();
  const mine = useMyEntry();
  const bets = useSync((s) => s.tables.bets);
  const entries = useSync((s) => s.tables.bet_entries);
  const items = useSync((s) => s.outbox.items);
  const views = useBetViews(
    bets,
    entries,
    items,
    board?.event.id ?? null,
    board?.anglers ?? [],
    board?.catches ?? [],
    board?.species ?? [],
  );
  const handles = new Map(board?.anglers.map((a) => [a.id, a.handle]) ?? []);
  const handleOf = (id: string) => handles.get(id) ?? 'An angler';
  const me = mine?.me.angler.id ?? null;
  const timeZone = board?.event.time_zone ?? 'America/Denver';

  return (
    <Page
      title={screen('side-bets').title}
      before={
        <Card title="Big Fish pot">
          <p className="hint">{bigFishNote(board?.event.fee_big_fish_cents ?? 1000)}</p>
          <BigFishList />
        </Card>
      }
      after={me ? <StartBet me={me} views={views} /> : null}
    >
      <p className="hint">
        Bets anglers run among themselves. <strong>The app keeps score, not the money</strong>:
        settle up between yourselves like you always have. Smallest, most and first are worked out
        automatically from approved catches; anything else is called by whoever started it.
      </p>
      {views.length === 0 ? (
        <p className="empty">No side bets yet. Start one below: smallest fish is a classic.</p>
      ) : (
        <ul className="bets" aria-label="Side bets">
          {views.map((v) => (
            <BetItem key={v.bet.id} view={v} me={me} handleOf={handleOf} timeZone={timeZone} />
          ))}
        </ul>
      )}
      {!me ? <p className="hint">Register on this device to start or join a bet.</p> : null}
    </Page>
  );
}

function BetItem({
  view,
  me,
  handleOf,
  timeZone,
}: {
  readonly view: BetView;
  readonly me: string | null;
  readonly handleOf: (id: string) => string;
  readonly timeZone: string;
}) {
  const sync = useSyncEngine();
  const [calling, setCalling] = useState(false);
  const { bet, entrants, leader } = view;
  const settled = bet.winner_angler_id !== null;
  const joined = me !== null && entrants.includes(me);
  const started = me !== null && bet.creator_angler_id === me;
  const scoring =
    bet.scoring === 'manual'
      ? `Called by ${handleOf(bet.creator_angler_id)}`
      : (SCORING.find((s) => s.value === bet.scoring)?.label ?? '');

  function send(label: string, fn: 'join_bet' | 'leave_bet' | 'delete_bet', withMe: boolean) {
    void sync.queue({
      id: crypto.randomUUID(),
      label,
      createdAt: Date.now(),
      steps: [
        {
          kind: 'call',
          fn,
          args: withMe && me ? { p_bet_id: bet.id, p_angler_id: me } : { p_bet_id: bet.id },
        },
      ],
    });
  }

  return (
    <li className="bet">
      <p className="bet__top">
        <span className="bet__title">
          {bet.title}
          {joined ? <span className="bet__in">In</span> : null}
        </span>
        {bet.stake ? <span className="bet__stake">{bet.stake}</span> : null}
      </p>
      <p className="bet__meta">
        {scoring} · {entrants.length} {entrants.length === 1 ? 'angler' : 'anglers'} in · started by{' '}
        {handleOf(bet.creator_angler_id)}
      </p>
      {bet.winner_angler_id !== null ? (
        <p className="bet__standing bet__standing--settled">
          Won by <strong>{handleOf(bet.winner_angler_id)}</strong>
        </p>
      ) : leader ? (
        <p className="bet__standing">
          Leading: <strong>{handleOf(leader.anglerId)}</strong> · {leaderDetail(leader, timeZone)}
        </p>
      ) : bet.scoring !== 'manual' && entrants.length > 0 ? (
        <p className="bet__standing">No approved catches from anyone in yet.</p>
      ) : null}
      {view.sending ? <p className="bet__meta">Waiting to send.</p> : null}
      {view.refused.map((item) => (
        <div className="notice notice--problem" key={item.seq} role="alert">
          <strong>{item.label}: not accepted</strong>
          {item.failure?.detail}{' '}
          <button
            className="button button--small"
            type="button"
            onClick={() => void sync.outbox.discard(item)}
          >
            Dismiss
          </button>
        </div>
      ))}
      {calling ? (
        <CallWinner
          view={view}
          handleOf={handleOf}
          onDone={() => {
            setCalling(false);
          }}
        />
      ) : (
        <div className="actions bet__actions">
          {!settled && me ? (
            joined ? (
              <button
                className="button button--small"
                type="button"
                onClick={() => {
                  send(`Leave “${bet.title}”`, 'leave_bet', true);
                }}
              >
                Leave
              </button>
            ) : (
              <button
                className="button button--small"
                type="button"
                onClick={() => {
                  send(`Join “${bet.title}”`, 'join_bet', true);
                }}
              >
                I’m in
              </button>
            )
          ) : null}
          {!settled && started && entrants.length > 0 ? (
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                setCalling(true);
              }}
            >
              Call the winner
            </button>
          ) : null}
          {started ? (
            <button
              className="button button--small button--danger"
              type="button"
              onClick={() => {
                if (window.confirm(`Delete “${bet.title}”? Everyone in it is dropped too.`)) {
                  send(`Delete “${bet.title}”`, 'delete_bet', false);
                }
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}

/** Pick the winner from who is in it, the app's own call ticked to start with. */
function CallWinner({
  view,
  handleOf,
  onDone,
}: {
  readonly view: BetView;
  readonly handleOf: (id: string) => string;
  readonly onDone: () => void;
}) {
  const sync = useSyncEngine();
  const name = useId();
  const suggested = view.leader?.anglerId ?? null;
  const [winner, setWinner] = useState<string | null>(
    suggested && view.entrants.includes(suggested) ? suggested : null,
  );
  return (
    <fieldset className="bet__call">
      <legend>Who won “{view.bet.title}”?</legend>
      {suggested ? <p className="hint">The app makes it {handleOf(suggested)}.</p> : null}
      {view.entrants.map((id) => (
        <label key={id} className="tick">
          <input
            type="radio"
            name={name}
            checked={winner === id}
            onChange={() => {
              setWinner(id);
            }}
          />
          {handleOf(id)}
        </label>
      ))}
      <div className="actions">
        <button
          className="button button--small"
          type="button"
          disabled={winner === null}
          onClick={() => {
            if (!winner) return;
            void sync.queue({
              id: crypto.randomUUID(),
              label: `Call “${view.bet.title}”`,
              createdAt: Date.now(),
              steps: [
                {
                  kind: 'call',
                  fn: 'settle_bet',
                  args: { p_bet_id: view.bet.id, p_winner_angler_id: winner },
                },
              ],
            });
            onDone();
          }}
        >
          Call it
        </button>
        <button className="button button--small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}

function StartBet({ me, views }: { readonly me: string; readonly views: readonly BetView[] }) {
  const sync = useSyncEngine();
  const ids = { title: useId(), scoring: useId(), stake: useId() };
  const [title, setTitle] = useState('');
  const [scoring, setScoring] = useState<BetScoring>('smallest');
  const [stake, setStake] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function start() {
    const wrong = newBetProblem(title, stake, views, me);
    setProblem(wrong);
    if (wrong) return;
    const id = crypto.randomUUID();
    // Starting a bet puts you in it: nobody starts one to sit it out.
    void sync.queue({
      id,
      label: `Start “${title.trim()}”`,
      createdAt: Date.now(),
      steps: [
        {
          kind: 'call',
          fn: 'create_bet',
          args: {
            p_id: id,
            p_angler_id: me,
            p_title: title.trim(),
            p_scoring: scoring,
            p_stake: stake.trim(),
          },
        },
        { kind: 'call', fn: 'join_bet', args: { p_bet_id: id, p_angler_id: me } },
      ],
    });
    setTitle('');
    setStake('');
  }

  return (
    <Card title="Start a bet">
      <div className="field">
        <label className="field__label" htmlFor={ids.title}>
          What is the bet?
        </label>
        <input
          id={ids.title}
          type="text"
          maxLength={70}
          placeholder="Smallest walleye of the day"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
          }}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={ids.scoring}>
          Who wins?
        </label>
        <select
          id={ids.scoring}
          value={scoring}
          onChange={(e) => {
            setScoring(e.target.value as BetScoring);
          }}
        >
          {SCORING.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={ids.stake}>
          Stake (optional)
        </label>
        <input
          id={ids.stake}
          type="text"
          maxLength={40}
          placeholder="A beer at the ramp"
          value={stake}
          onChange={(e) => {
            setStake(e.target.value);
          }}
        />
      </div>
      <p className="hint">
        Keep it clean and keep it friendly: the director can remove any bet, and everyone in the
        tournament can see this.
      </p>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button className="button button--secondary" type="button" onClick={start}>
        Start it
      </button>
    </Card>
  );
}
