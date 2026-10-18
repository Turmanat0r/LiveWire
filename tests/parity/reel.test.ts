// The gallery's order and the highlight reel's plan, run side by side with the
// old app: which fish, in what order, for how long, and what the file is
// called.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadLegacy, type LegacyAngler, type LegacyCatch } from './legacy';
import { galleryRows } from '../../src/data/gallery';
import type { Row } from '../../src/data/tables';
import { reelFileName, reelOrder, reelPlan, sceneAt } from '../../src/domain/reel';
import { tournamentArb } from '../../src/test/arbitraries';
import { catchRow, EVENT_ID } from '../../src/test/rows';

const legacy = loadLegacy();
const RUNS = 1_000;

describe('the gallery and the reel match the old app', () => {
  it('orders the wall yours first then newest, and the reel yours only, biggest first', () => {
    fc.assert(
      fc.property(
        tournamentArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }),
        (t, mask) => {
          const mine = t.anglers.filter((_, i) => mask[i % mask.length]).map((a) => a.id);
          const anglers = t.anglers.map((a): Row<'anglers'> => ({
            id: a.id,
            entry_id: a.teamId ?? a.id,
            event_id: EVENT_ID,
            role: a.role,
            handle: a.handle,
            big_fish: a.bigFish,
            disqualified: a.disqualified,
            registered_at: '2027-01-01T00:00:00Z',
          }));
          const catches = t.catches.map((c) =>
            catchRow({
              id: c.id,
              angler_id: c.anglerId,
              division: c.division,
              species: c.species,
              length_inches: c.lengthInches,
              logged_at: new Date(c.loggedAt).toISOString(),
              status: c.status,
            }),
          );
          const ours = galleryRows(catches, anglers, EVENT_ID, new Set(mine));
          const oldAnglers = t.anglers.map((a): LegacyAngler => ({
            id: a.id,
            name: a.id,
            handle: a.handle,
            division: a.division,
            role: a.role,
            teamId: a.teamId,
            bigfish: a.bigFish,
            disqualified: a.disqualified,
          }));
          const oldCatches = t.catches.map((c): LegacyCatch => ({
            id: c.id,
            anglerId: c.anglerId,
            division: c.division,
            species: c.species,
            length: c.lengthInches,
            timestamp: c.loggedAt,
            status: c.status,
          }));
          const view = (rows: readonly { id: string; mine: boolean }[]) =>
            rows.map((r) => [r.id, r.mine]);
          expect(view(ours)).toEqual(view(legacy.galleryOrder(oldCatches, oldAnglers, mine)));
          expect(view(reelOrder(ours))).toEqual(
            view(legacy.reelRows(oldCatches, oldAnglers, mine)),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('plans the same scenes, and puts the same one on screen at every moment', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.option(fc.integer({ min: -2, max: 15 }), { nil: undefined }),
        fc.array(fc.integer({ min: -500, max: 40_000 }), { maxLength: 30 }),
        (count, maxShots, moments) => {
          const rows = Array.from({ length: count }, (_, i) => ({ id: `r${String(i)}` }));
          const ours = maxShots === undefined ? reelPlan(rows) : reelPlan(rows, maxShots);
          const theirs = legacy.reelPlan(rows, maxShots === undefined ? undefined : { maxShots });
          const scenes = (list: readonly { kind: string; ms: number; row?: { id: string } }[]) =>
            list.map((s) => [s.kind, s.ms, s.row?.id ?? null]);
          expect(scenes(ours.scenes)).toEqual(scenes(theirs.scenes));
          expect([ours.shots, ours.dropped, ours.totalMs]).toEqual([
            theirs.shots,
            theirs.dropped,
            theirs.totalMs,
          ]);
          for (const ms of [...moments, 0, ours.totalMs - 1, ours.totalMs]) {
            const a = sceneAt(ours, ms);
            const b = legacy.reelSceneAt(theirs, ms);
            expect(a && [a.index, a.progress]).toEqual(b && [b.index, b.progress]);
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('names the file the same way', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('MKWO', '', 'Fall Classic!', 'ÉTÉ'),
        fc.array(fc.constantFrom('2026-09-18', '2027-09-19', '2028-01-02'), { maxLength: 3 }),
        fc.oneof(
          fc.constant(''),
          fc.string(),
          fc.constantFrom('Salty Bedrock Perch', 'Ünïcode Øtter'),
        ),
        fc.constantFrom('mp4', 'webm'),
        (prefix, dates, handle, ext) => {
          expect(reelFileName(prefix, dates, handle, ext)).toBe(
            legacy.reelFileName({ prefix, dates }, handle, ext),
          );
        },
      ),
      { numRuns: RUNS },
    );
  });
});
