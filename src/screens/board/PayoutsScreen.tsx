import { useMemo } from 'react';
import { screen } from '../../app/screens';
import { usePoolCounts } from '../../data/pools';
import { useSync } from '../../data/useSync';
import { dollarsText } from '../../domain/money';
import { timeOfDayText } from '../../domain/time';
import { Page } from '../../ui/Page';
import { payouts, sharesFrom, splitText, type DivisionPool } from './payouts';
import './board.css';

/** $12.00: the payout screen always shows cents, as the old one did. */
function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function Division({ pool }: { readonly pool: DivisionPool }) {
  const disqualified = pool.entries - pool.eligible;
  return (
    <section className="pool" aria-label={pool.name}>
      <p className="pool__head">
        {pool.name} · {pool.entries} {pool.entries === 1 ? 'entry' : 'entries'} ·{' '}
        {money(pool.poolCents)} pool
        {pool.donatedCents > 0 ? ` · +${money(pool.donatedCents)} donated` : ''}
      </p>
      {pool.awards.length === 0 ? (
        <p className="hint">No entries yet.</p>
      ) : (
        <ul className="lb">
          {pool.awards.map((a) => (
            <li key={a.place} className="lbrow">
              <span className="lbrow__who">
                <span className="lbrow__name">{a.place}</span>
              </span>
              <span className="lbrow__len">{money(a.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      {pool.unawardedCents > 0 ? (
        <p className="hint">
          {money(pool.unawardedCents)} of this pool is unawarded: the field is too small to fill all
          placements.
        </p>
      ) : null}
      {disqualified > 0 ? (
        <p className="hint">
          {disqualified} disqualified: entry fee stays in the pool, place forfeited.
        </p>
      ) : null}
    </section>
  );
}

/**
 * What each pool holds and how it splits. Built from how many entries have
 * paid, which the server counts, and the director's donations: who has paid
 * stays between each angler and the director.
 */
export function PayoutsScreen() {
  const title = screen('payouts').title;
  const event = useSync((s) => s.event);
  const donations = useSync((s) => s.tables.donations);
  const kept = usePoolCounts(event?.id ?? null);
  const shares = useMemo(() => sharesFrom(event?.payout_basis_points ?? []), [event]);
  const model = useMemo(() => {
    if (!event || !kept) return null;
    return payouts(
      kept.counts,
      {
        soloCents: event.fee_solo_cents,
        teamCents: event.fee_team_cents,
        bigFishCents: event.fee_big_fish_cents,
      },
      [...donations.values()].filter((d) => d.event_id === event.id),
      shares,
    );
  }, [event, kept, donations, shares]);

  return (
    <Page title={title}>
      <p className="hint">
        Read-only estimate from the paid entries, plus any donations the tournament director has
        logged. Division pools use a {splitText(shares)} split. Big Fish is winner take all.
      </p>
      {!model ? (
        <p className="empty">
          The pools are counted by the tournament server. They show here once this phone has signal.
        </p>
      ) : (
        <>
          {model.generalCents > 0 ? (
            <>
              <div className="lbrow">
                <span className="lbrow__who">
                  <span className="lbrow__name">General tournament fund</span>
                  <span className="lbrow__sub">Not split: held for director discretion</span>
                </span>
                <span className="lbrow__len">{money(model.generalCents)}</span>
              </div>
              <hr className="divider" />
            </>
          ) : null}
          <Division pool={model.solo} />
          <Division pool={model.team} />
          <hr className="divider" />
          <div className="lbrow">
            <span className="lbrow__who">
              <span className="lbrow__name">Big Fish pot</span>
              <span className="lbrow__sub">
                {model.bigFish.anglers} angler{model.bigFish.anglers === 1 ? '' : 's'} opted in,
                winner take all
                {model.bigFish.donatedCents > 0
                  ? ` · +${money(model.bigFish.donatedCents)} donated`
                  : ''}
              </span>
            </span>
            <span className="lbrow__len">{money(model.bigFish.poolCents)}</span>
          </div>
          {kept && event ? (
            <p className="hint">
              Entry counts as of {timeOfDayText(kept.at, event.time_zone)}. Entry fees:{' '}
              {dollarsText(event.fee_solo_cents)} solo, {dollarsText(event.fee_team_cents)} team,{' '}
              {dollarsText(event.fee_big_fish_cents)} Big Fish.
            </p>
          ) : null}
        </>
      )}
    </Page>
  );
}
