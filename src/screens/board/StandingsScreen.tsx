import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { screen } from '../../app/screens';
import { rowName, speciesPhrase, useBoard } from '../../data/board';
import { useMyEntry } from '../../data/myEntry';
import { standings } from '../../domain/scoring';
import type { Division } from '../../domain/types';
import { Page } from '../../ui/Page';
import './board.css';

/** Two decimals, as the old leaderboard printed lengths: 26.25″, 24.00″. */
export function inchesText(inches: number): string {
  return `${inches.toFixed(2)}″`;
}

/**
 * The solo and team boards. One fish ranks an entry, the longest; then the
 * best three combined; then whoever caught their best fish first. A team
 * ranks as one, on either partner's fish.
 */
export function StandingsScreen() {
  const title = screen('standings').title;
  const board = useBoard();
  const mine = useMyEntry();
  const [params, setParams] = useSearchParams();
  const asked = params.get('division');
  const division: Division =
    asked === 'team' || asked === 'solo' ? asked : (mine?.entry.division ?? 'solo');

  const rows = useMemo(
    () => (board ? standings(division, board.catches, board.anglers, board.species) : []),
    [board, division],
  );
  const myIds = new Set(mine?.anglers.map((a) => a.angler.id) ?? []);
  const sp = speciesPhrase(board?.species ?? []);

  return (
    <Page title={title}>
      <div className="divtabs" role="group" aria-label="Division">
        {(['solo', 'team'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={d === division}
            onClick={() => {
              setParams({ division: d }, { replace: true });
            }}
          >
            {d === 'solo' ? 'Solo' : 'Team'}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty">No approved catches yet in this division.</p>
      ) : (
        <ol className="lb" aria-label={division === 'solo' ? 'Solo standings' : 'Team standings'}>
          {rows.map((row, i) => {
            const isMine =
              row.anglerIds.some((id) => myIds.has(id)) ||
              (division === 'team' && mine?.entry.id === row.key);
            return (
              <li key={row.key} className={isMine ? 'lbrow lbrow--mine' : 'lbrow'}>
                <span className="lbrow__rank">{i + 1}</span>
                <span className="lbrow__who">
                  <span className="lbrow__name">
                    {board ? rowName(row.key, board.anglers) : ''}
                    {isMine ? <span className="lbrow__you">You</span> : null}
                  </span>
                  <span className="lbrow__sub">Best 3 combined: {inchesText(row.top3Inches)}</span>
                </span>
                <span className="lbrow__len">{inchesText(row.bestInches)}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="hint">
        {division === 'team'
          ? `Ranked by the single longest ${sp} caught by either teammate. Ties broken by the combined length of the team’s best 3 fish, then by whichever fish was logged first.`
          : `Ranked by single longest ${sp}. Ties broken by combined length of best 3 fish, then by whichever fish was logged first.`}
      </p>
    </Page>
  );
}
