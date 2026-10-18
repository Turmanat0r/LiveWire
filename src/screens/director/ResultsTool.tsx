import { useMemo } from 'react';
import { useBoard } from '../../data/board';
import { buildResults, resultsJson, resultsView, type ResultPlace } from '../../data/results';
import { useSync } from '../../data/useSync';
import { Card } from '../../ui/Card';
import { inchesText } from '../board/StandingsScreen';
import { useDirectorQueue } from './queue';
import '../board/board.css';

/** The event's result, frozen or as the board stands, and whether a change is still sending. */
export function useResults() {
  const board = useBoard();
  const rows = useSync((s) => s.tables.results);
  const bets = useSync((s) => s.tables.bets);
  const items = useSync((s) => s.outbox.items);
  return useMemo(() => {
    if (!board) return null;
    const { event } = board;
    const view = resultsView(rows.values(), items, event.id);
    const live = buildResults(
      board.anglers,
      board.catches,
      board.species,
      [...bets.values()].filter((b) => b.event_id === event.id),
    );
    const pending = board.catches.filter((c) => c.status === 'pending').length;
    return { event, view, live, pending };
  }, [board, rows, bets, items]);
}

function Podium({ places }: { readonly places: readonly ResultPlace[] }) {
  if (places.length === 0) return <p className="hint">Nobody ranked.</p>;
  return (
    <ul className="lb">
      {places.slice(0, 3).map((p) => (
        <li key={p.key} className="lbrow">
          <span className="lbrow__rank">{p.place}</span>
          <span className="lbrow__who">
            <span className="lbrow__name">{p.names}</span>
          </span>
          <span className="lbrow__len">{inchesText(p.bestInches)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The old app's Results tool. The trophy case works the placings out again
 * from the catches every time it opens: right while the event runs, wrong
 * once it is over, when a later cleanup would quietly rewrite what an angler
 * was told on the day. Freezing writes the placings, the Big Fish pot and the
 * settled side bets down once, and the trophy case reads those from then on.
 */
export function ResultsTool() {
  const queue = useDirectorQueue();
  const results = useResults();
  if (!results) return null;
  const { event, view, live, pending } = results;
  const shown = view.record ?? live;
  const frozenText = view.frozenAt
    ? new Date(view.frozenAt).toLocaleString('en-US', {
        timeZone: event.time_zone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  function freeze() {
    const sure = window.confirm(
      `Freeze this year’s results?\n\nEvery angler’s trophy case will show these placings from now on, whatever happens to the records afterwards.${
        pending > 0
          ? `\n\n${String(pending)} ${pending === 1 ? 'catch is' : 'catches are'} still waiting on review and will NOT count.`
          : ''
      }`,
    );
    if (!sure) return;
    queue(`Freeze ${event.name}’s results`, [
      {
        kind: 'call',
        fn: 'director_freeze_results',
        args: { p_event_id: event.id, p_record: resultsJson(live) },
      },
    ]);
  }

  return (
    <Card title="Results">
      <p className="hint">
        The trophy case works the placings out again from the catches every time it opens. That is
        right while the event is running and wrong once it is over: a later cleanup would quietly
        rewrite what an angler’s trophy case says about this year. Freezing writes the placings, the
        Big Fish pot and the settled side bets down once, and the trophy case reads those from then
        on.
      </p>
      <p className={view.record ? 'ok' : 'hint'} role="status">
        {view.record
          ? `Frozen ${frozenText ?? ''}${view.sending ? ' (waiting to send)' : ''}. The trophy case reads this, so nothing logged from here on changes it.`
          : view.sending
            ? 'Unfrozen (waiting to send). The trophy case goes back to working it out from the catches.'
            : pending > 0
              ? `Not frozen. ${String(pending)} ${pending === 1 ? 'catch is' : 'catches are'} still waiting on review: freezing now would leave ${pending === 1 ? 'it' : 'them'} out.`
              : 'Not frozen. The trophy case is still working this out from the catches every time it opens.'}
      </p>
      <section className="money-part" aria-label="Solo division">
        <h3 className="card__subtitle">Solo</h3>
        <Podium places={shown.divisions.solo} />
      </section>
      <section className="money-part" aria-label="Team division">
        <h3 className="card__subtitle">Team</h3>
        <Podium places={shown.divisions.team} />
      </section>
      <section className="money-part" aria-label="Big Fish pot">
        <h3 className="card__subtitle">Big Fish pot</h3>
        {shown.bigFish ? (
          <div className="lbrow">
            <span className="lbrow__who">
              <span className="lbrow__name">{shown.bigFish.name}</span>
            </span>
            <span className="lbrow__len">{inchesText(shown.bigFish.inches)}</span>
          </div>
        ) : (
          <p className="hint">No qualifying catch in the pot.</p>
        )}
      </section>
      <section className="money-part" aria-label="Side bets">
        <h3 className="card__subtitle">Side bets</h3>
        {shown.bets.length === 0 ? (
          <p className="hint">None settled.</p>
        ) : (
          <ul className="lb">
            {shown.bets.map((b) => (
              <li key={b.id} className="lbrow">
                <span className="lbrow__who">
                  <span className="lbrow__name">{b.title}</span>
                  <span className="lbrow__sub">{b.winner}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="actions">
        <button className="button button--secondary" type="button" onClick={freeze}>
          {view.record ? 'Re-freeze from the catches as they stand' : 'Freeze this year’s results'}
        </button>
        {view.record ? (
          <button
            className="button button--small button--danger"
            type="button"
            onClick={() => {
              const sure = window.confirm(
                'Unfreeze?\n\nThe trophy case goes back to working the placings out from the catches, so they can move again.',
              );
              if (!sure) return;
              queue(`Unfreeze ${event.name}’s results`, [
                { kind: 'call', fn: 'director_unfreeze_results', args: { p_event_id: event.id } },
              ]);
            }}
          >
            Unfreeze
          </button>
        ) : null}
      </div>
    </Card>
  );
}
