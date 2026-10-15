import { useMemo } from 'react';
import { screen } from '../../app/screens';
import { useBoard } from '../../data/board';
import { useMyEntry } from '../../data/myEntry';
import { dollarsText } from '../../domain/money';
import { bigFishBoard } from '../../domain/scoring';
import { Page } from '../../ui/Page';
import { inchesText } from './StandingsScreen';
import './board.css';

/** The top ten fish in the pot. */
const SHOWN = 10;

/**
 * The Big Fish pot: the single longest approved fish among the anglers who
 * bought in. Winner take all. Also heads the side bets screen, as it did in
 * the old app.
 */
export function BigFishList() {
  const board = useBoard();
  const mine = useMyEntry();
  const fish = useMemo(
    () => (board ? bigFishBoard(board.catches, board.anglers, board.species).slice(0, SHOWN) : []),
    [board],
  );
  const handles = new Map(board?.anglers.map((a) => [a.id, a.handle]) ?? []);
  const myIds = new Set(mine?.anglers.map((a) => a.angler.id) ?? []);
  if (fish.length === 0) return <p className="empty">No qualifying catches yet.</p>;
  return (
    <ol className="lb" aria-label="Big Fish">
      {fish.map((c, i) => {
        const isMine = myIds.has(c.anglerId);
        return (
          <li key={c.id} className={isMine ? 'lbrow lbrow--mine' : 'lbrow'}>
            <span className="lbrow__rank">{i + 1}</span>
            <span className="lbrow__who">
              <span className="lbrow__name">
                {handles.get(c.anglerId) ?? 'An angler'}
                {isMine ? <span className="lbrow__you">You</span> : null}
              </span>
              <span className="lbrow__sub">{c.division === 'team' ? 'Team' : 'Solo'} division</span>
            </span>
            <span className="lbrow__len">{inchesText(c.lengthInches)}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function bigFishNote(feeCents: number): string {
  return `Optional ${dollarsText(feeCents)}/angler side pot. Winner take all.`;
}

export function BigFishScreen() {
  const board = useBoard();
  return (
    <Page title={screen('big-fish').title}>
      <p className="hint">{bigFishNote(board?.event.fee_big_fish_cents ?? 1000)}</p>
      <BigFishList />
    </Page>
  );
}
