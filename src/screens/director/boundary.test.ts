import { describe, expect, it } from 'vitest';
import type { Row } from '../../data/tables';
import type { Boundary } from '../../domain/geo';
import { EVENT_ID } from '../../test/rows';
import {
  checkDraft,
  describeBoundary,
  draftFrom,
  parsePointLines,
  pointLines,
  recheck,
  tapped,
} from './boundary';

const CIRCLE: Boundary = {
  kind: 'circle',
  center: { lat: 46.38917, lng: -111.57556 },
  radiusMiles: 4,
};

function evidence(over: Partial<Row<'catch_evidence'>>): Row<'catch_evidence'> {
  return {
    catch_id: crypto.randomUUID(),
    event_id: EVENT_ID,
    lat: 46.39,
    lng: -111.57,
    accuracy_miles: 0.01,
    boundary: null,
    captured_at: null,
    clock_offset_ms: 0,
    photo_source: 'camera',
    precheck: null,
    ai_review: null,
    filed_by: null,
    filed_by_director: false,
    review_note: '',
    reviewed_at: null,
    reviewed_by: null,
    ...over,
  };
}

describe('the boundary editor', () => {
  it('drops a circle’s centre, or an outline’s corners, where the map is tapped', () => {
    const circle = tapped(draftFrom({ kind: 'none' }), { lat: 1, lng: 2 });
    expect(circle.kind).toBe('none');
    const c = tapped(
      { ...draftFrom({ kind: 'none' }), kind: 'circle', radiusMiles: 0 },
      {
        lat: 46.123456789,
        lng: -111.987654321,
      },
    );
    expect(c).toMatchObject({ center: { lat: 46.12346, lng: -111.98765 }, radiusMiles: 1 });
    let outline = { ...draftFrom(CIRCLE), kind: 'polygon' as const };
    for (const p of [
      { lat: 46.412, lng: -111.601 },
      { lat: 46.412, lng: -111.54 },
    ])
      outline = { ...tapped(outline, p), kind: 'polygon' };
    // Switching modes keeps the circle for later.
    expect(outline.center).toEqual(CIRCLE.center);
    expect(outline.points).toHaveLength(2);
    expect(checkDraft(outline)).toEqual({
      ok: false,
      problem: 'An outline needs at least three corners. Tap the map to add them.',
    });
    const done = tapped(outline, { lat: 46.36, lng: -111.54 });
    const checked = checkDraft(done);
    expect(checked.ok && describeBoundary(checked.boundary)).toBe('3-corner outline');
  });

  it('refuses a circle with no centre or no radius, or a position that is not real', () => {
    const none = draftFrom({ kind: 'none' });
    expect(checkDraft({ ...none, kind: 'circle' })).toMatchObject({
      problem: /Set a centre first/,
    });
    expect(
      checkDraft({ ...none, kind: 'circle', center: { lat: 46, lng: -111 }, radiusMiles: 0 }),
    ).toMatchObject({ problem: 'Give the circle a radius in miles.' });
    expect(
      checkDraft({ ...none, kind: 'circle', center: { lat: 146, lng: -111 }, radiusMiles: 1 }),
    ).toMatchObject({ problem: /not a real position/ });
    const ok = checkDraft(draftFrom(CIRCLE));
    expect(ok.ok && describeBoundary(ok.boundary)).toBe('4 mile circle around 46.3892, -111.5756');
    expect(checkDraft(none)).toEqual({ ok: true, boundary: { kind: 'none' } });
  });

  it('reads typed corners however they are separated, and writes them back the same way', () => {
    const points = parsePointLines('46.412, -111.601\n46.412 -111.54\n\nnonsense\n46.36,-111.54');
    expect(points).toEqual([
      { lat: 46.412, lng: -111.601 },
      { lat: 46.412, lng: -111.54 },
      { lat: 46.36, lng: -111.54 },
    ]);
    expect(pointLines(points)).toBe(
      '46.41200, -111.60100\n46.41200, -111.54000\n46.36000, -111.54000',
    );
  });

  it('re-judges filed catches against a changed course, and counts the ones that flip', () => {
    const inside = evidence({
      lat: 46.39,
      lng: -111.57,
      boundary: { kind: 'circle', within: true, fromLaunchMiles: 0.3, outsideMiles: 0 },
    });
    const far = evidence({
      lat: 46.45,
      lng: -111.5,
      boundary: { kind: 'circle', within: true, fromLaunchMiles: 5.1, outsideMiles: 0 },
    });
    const nowhere = evidence({ lat: null, lng: null });
    const small: Boundary = { ...CIRCLE, radiusMiles: 2 };
    const r = recheck([inside, far, nowhere], EVENT_ID, small);
    expect(r.located).toBe(2);
    expect(r.flips).toBe(1);
    expect(r.updates.find((u) => u.catchId === far.catch_id)?.verdict).toMatchObject({
      kind: 'circle',
      within: false,
    });

    // Once stored, the same course finds nothing to change.
    const settled = [inside, far].map((e) => ({
      ...e,
      boundary: r.updates.find((u) => u.catchId === e.catch_id)?.verdict ?? e.boundary,
    }));
    expect(recheck(settled, EVENT_ID, small)).toEqual({ located: 2, updates: [], flips: 0 });
  });
});
