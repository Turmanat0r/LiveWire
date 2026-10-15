import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYOUT } from '../../domain/money';
import { payouts, placeName, sharesFrom, splitText } from './payouts';

const FEES = { soloCents: 3000, teamCents: 5000, bigFishCents: 1000 };
const counts = {
  soloPaid: 3,
  teamsPaid: 2,
  bigFishPaid: 4,
  soloEligible: 2,
  teamsEligible: 2,
};

describe('the payout screen', () => {
  it('builds each pool from paid entries and donations, and splits it 50/30/20', () => {
    const p = payouts(
      counts,
      FEES,
      [
        { target: 'solo', amount_cents: 1000 },
        { target: 'big_fish', amount_cents: 2500 },
        { target: 'general', amount_cents: 4000 },
      ],
      DEFAULT_PAYOUT,
    );
    expect(p.generalCents).toBe(4000);
    // Three paid solo entries and a $10 donation: $100. One is disqualified,
    // so two places are filled and 3rd place's $20 stays unawarded.
    expect(p.solo).toMatchObject({
      entries: 3,
      eligible: 2,
      poolCents: 10_000,
      donatedCents: 1000,
    });
    expect(p.solo.awards).toEqual([
      { place: '1st', cents: 5000 },
      { place: '2nd', cents: 3000 },
    ]);
    expect(p.solo.unawardedCents).toBe(2000);
    expect(p.team.poolCents).toBe(10_000);
    expect(p.bigFish).toEqual({ anglers: 4, donatedCents: 2500, poolCents: 6500 });
  });

  it('splits to the cent, and the parts add up to the whole', () => {
    const p = payouts(
      { ...counts, soloPaid: 1, soloEligible: 3 },
      FEES,
      [{ target: 'solo', amount_cents: 1 }],
      DEFAULT_PAYOUT,
    );
    expect(p.solo.awards.reduce((s, a) => s + a.cents, 0)).toBe(p.solo.poolCents);
  });

  it('awards nothing, and holds nothing back, before anyone has paid', () => {
    const none = { soloPaid: 0, teamsPaid: 0, bigFishPaid: 0, soloEligible: 0, teamsEligible: 0 };
    const p = payouts(none, FEES, [], DEFAULT_PAYOUT);
    expect(p.solo.awards).toEqual([]);
    expect(p.solo.unawardedCents).toBe(0);
  });

  it('takes the event’s own split', () => {
    const shares = sharesFrom([6000, 2500, 1000, 500]);
    expect(shares.map((s) => s.place)).toEqual(['1st', '2nd', '3rd', '4th']);
    expect(splitText(shares)).toBe('60/25/10/5');
    expect([11, 12, 13, 21, 22, 103].map(placeName)).toEqual([
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '103rd',
    ]);
  });
});
