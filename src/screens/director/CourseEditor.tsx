import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { failureText } from '../../app/failureText';
import { currentFix } from '../../app/location';
import { failureOf } from '../../data/remote';
import type { Row } from '../../data/tables';
import { useSync, useSyncEngine } from '../../data/useSync';
import { parseBoundary, type Boundary } from '../../domain/geo';
import {
  checkDraft,
  describeBoundary,
  draftFrom,
  parsePointLines,
  pointLines,
  recheck,
  sameBoundary,
  tapped,
  type BoundaryDraft,
  type BoundaryKind,
} from './boundary';
import { courseJson } from './eventForm';
import { useDirectorQueue } from './queue';
import '../../ui/map.css';

const BoundaryMap = lazy(() => import('./BoundaryMap'));

const MODES: readonly { readonly kind: BoundaryKind; readonly label: string }[] = [
  { kind: 'circle', label: 'Circle' },
  { kind: 'polygon', label: 'Outline' },
  { kind: 'none', label: 'No boundary' },
];

const HELP: Readonly<Record<BoundaryKind, string>> = {
  circle:
    'Tap the map to drop the launch point. Drag + to move the whole circle, or ↔ on the edge to grow and shrink it. Typing the numbers does the same.',
  polygon:
    'Tap the map to drop each corner, going around the course. Drag a numbered corner to move it. Three or more make the shape; the last joins back to the first.',
  none: 'No boundary. Catches still record where they were taken, but nothing is judged in or out.',
};

/** What the typed boxes say, kept apart from the draft so "-111." can be typed on the way to "-111.5". */
interface Typed {
  readonly lat: string;
  readonly lng: string;
  readonly radius: string;
  readonly points: string;
}

function typedFrom(d: BoundaryDraft): Typed {
  return {
    lat: d.center ? String(d.center.lat) : '',
    lng: d.center ? String(d.center.lng) : '',
    radius: d.radiusMiles > 0 ? String(d.radiusMiles) : '',
    points: pointLines(d.points),
  };
}

/**
 * Where the event is fished. Every catch records whether it was taken inside
 * this line, and anglers check themselves against it on the Safety screen.
 * Drawn on the map or typed in: either way it is the same boundary.
 */
export function CourseEditor({
  event,
  isLive,
}: {
  readonly event: Row<'events'>;
  readonly isLive: boolean;
}) {
  const sync = useSyncEngine();
  const ids = { head: useId(), lat: useId(), lng: useId(), radius: useId(), points: useId() };
  const saved = useMemo(() => parseBoundary(event.course), [event.course]);
  const [draft, setDraft] = useState<BoundaryDraft>(() => draftFrom(saved));
  const [typed, setTyped] = useState<Typed>(() => typedFrom(draftFrom(saved)));
  const [frame, setFrame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const checked = checkDraft(draft);
  const unsaved = !checked.ok || !sameBoundary(checked.boundary, saved);

  /** A change from the map or a button: the boxes follow it. */
  const change = (next: BoundaryDraft) => {
    setDraft(next);
    setTyped(typedFrom(next));
    setDone(false);
    setProblem(null);
  };

  /** A change typed into a box: the draft follows whatever parses. */
  const type = (field: keyof Typed, value: string) => {
    const next = { ...typed, [field]: value };
    setTyped(next);
    setDone(false);
    const lat = Number(next.lat);
    const lng = Number(next.lng);
    setDraft((d) => ({
      ...d,
      center: next.lat.trim() && next.lng.trim() ? { lat, lng } : null,
      radiusMiles: Number(next.radius),
      points: parsePointLines(next.points),
    }));
  };

  async function locate() {
    setBusy(true);
    setProblem(null);
    const fix = await currentFix();
    setBusy(false);
    if (!fix) {
      setProblem('This phone could not find where it is. Check location is on, or tap the map.');
      return;
    }
    change(tapped(draft, fix));
    setFrame((f) => f + 1);
  }

  async function save() {
    if (!checked.ok) {
      setProblem(checked.problem);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await sync.call('director_set_course', {
        p_event_id: event.id,
        p_course: courseJson(checked.boundary),
      });
      await sync.refreshEvents();
      setDone(true);
    } catch (error) {
      setProblem(failureText(failureOf(error), 'Saving the boundary'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="money-part" aria-labelledby={ids.head}>
      <h3 className="card__subtitle" id={ids.head}>
        Course boundary
      </h3>
      <p className="hint">
        Where the event is fished. Every catch records whether it was taken inside this line, and
        anglers can check themselves against it on the Safety screen.
      </p>
      <div className="contestant-filters" role="group" aria-label="Kind of boundary">
        {MODES.map((m) => (
          <button
            key={m.kind}
            type="button"
            aria-pressed={draft.kind === m.kind}
            onClick={() => {
              if (draft.kind === m.kind) return;
              change({
                ...draft,
                kind: m.kind,
                radiusMiles: draft.radiusMiles > 0 ? draft.radiusMiles : 1,
              });
              setFrame((f) => f + 1);
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="hint">{HELP[draft.kind]}</p>
      <Suspense
        fallback={
          <div className="course-map course-map--tall course-map--waiting">Loading the map…</div>
        }
      >
        <BoundaryMap draft={draft} onChange={change} frame={frame} />
      </Suspense>
      <div className="actions">
        {draft.kind !== 'none' ? (
          <button
            className="button button--small"
            type="button"
            disabled={busy}
            onClick={() => void locate()}
          >
            Use my location
          </button>
        ) : null}
        {draft.kind === 'polygon' && draft.points.length > 0 ? (
          <button
            className="button button--small"
            type="button"
            onClick={() => {
              change({ ...draft, points: draft.points.slice(0, -1) });
            }}
          >
            Undo corner
          </button>
        ) : null}
        {draft.kind !== 'none' ? (
          <button
            className="button button--small"
            type="button"
            onClick={() => {
              change(
                draft.kind === 'polygon' ? { ...draft, points: [] } : { ...draft, center: null },
              );
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {draft.kind === 'circle' ? (
        <div className="event-form__fields">
          <div className="event-form__pair">
            <div className="field">
              <label className="field__label" htmlFor={ids.lat}>
                Centre latitude
              </label>
              <input
                id={ids.lat}
                type="text"
                inputMode="decimal"
                placeholder="46.38917"
                value={typed.lat}
                onChange={(e) => {
                  type('lat', e.target.value);
                }}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={ids.lng}>
                Centre longitude
              </label>
              <input
                id={ids.lng}
                type="text"
                inputMode="decimal"
                placeholder="-111.57556"
                value={typed.lng}
                onChange={(e) => {
                  type('lng', e.target.value);
                }}
              />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={ids.radius}>
              Radius (miles)
            </label>
            <input
              id={ids.radius}
              type="text"
              inputMode="decimal"
              placeholder="4"
              value={typed.radius}
              onChange={(e) => {
                type('radius', e.target.value);
              }}
            />
          </div>
        </div>
      ) : null}
      {draft.kind === 'polygon' ? (
        <div className="field">
          <label className="field__label" htmlFor={ids.points}>
            Corners: one “latitude, longitude” per line
          </label>
          <textarea
            id={ids.points}
            rows={5}
            spellCheck={false}
            placeholder={'46.41200, -111.60100\n46.41200, -111.54000\n46.36000, -111.54000'}
            value={typed.points}
            onChange={(e) => {
              type('points', e.target.value);
            }}
          />
        </div>
      ) : null}

      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      {done ? (
        <p className="ok" role="status">
          Saved. Every phone judges against it from now on.
        </p>
      ) : null}
      <button
        className="button button--secondary"
        type="button"
        disabled={busy || !unsaved}
        onClick={() => void save()}
      >
        Save boundary
      </button>
      <p className="hint">
        In force now: {describeBoundary(saved)}
        {unsaved ? '. Unsaved changes above.' : '.'}
      </p>
      {isLive ? <RecheckCatches eventId={event.id} course={saved} /> : null}
    </section>
  );
}

/**
 * Each catch was judged against the boundary in force when it was filed.
 * After a change, this judges every one again from the position already
 * stored with it. Nothing is approved, rejected or deleted: only the in or
 * out reading changes.
 */
function RecheckCatches({
  eventId,
  course,
}: {
  readonly eventId: string;
  readonly course: Boundary;
}) {
  const queue = useDirectorQueue();
  const evidence = useSync((s) => s.tables.catch_evidence);
  const items = useSync((s) => s.outbox.items);
  const r = useMemo(() => recheck(evidence.values(), eventId, course), [evidence, eventId, course]);
  const waiting = items.some(
    (i) =>
      i.failure === null &&
      i.steps.some((s) => s.kind === 'call' && s.fn === 'director_set_catch_boundary'),
  );
  const n = r.updates.length;
  return (
    <div className="money-part">
      <p className="card__subtitle">Re-check filed catches</p>
      <p className="hint">
        {r.located === 0
          ? 'No catch has a stored position to re-check yet.'
          : waiting
            ? 'The re-check is waiting to send.'
            : n === 0
              ? `Every catch’s reading matches the boundary in force (${String(r.located)} with a position).`
              : r.flips > 0
                ? `${String(r.flips)} of ${String(r.located)} catches change between in and out against the boundary in force now.`
                : `No catch changes between in and out, but ${String(n)} ${n === 1 ? 'has its distance' : 'have their distances'} from the line out of date.`}
      </p>
      {n > 0 && !waiting ? (
        <button
          className="button button--small"
          type="button"
          onClick={() => {
            const sure = window.confirm(
              `Re-check ${String(n)} ${n === 1 ? 'catch' : 'catches'} against the boundary in force now?\n\n` +
                (r.flips > 0 ? `${String(r.flips)} change between in and out. ` : '') +
                'Nothing is approved, rejected or deleted: only the in or out reading changes.',
            );
            if (!sure) return;
            queue(
              `Re-check ${String(n)} ${n === 1 ? 'catch' : 'catches'} against the boundary`,
              r.updates.map((u) => ({
                kind: 'call',
                fn: 'director_set_catch_boundary',
                args: { p_id: u.catchId, p_boundary: { ...u.verdict } },
              })),
            );
          }}
        >
          Re-check every catch
        </button>
      ) : null}
    </div>
  );
}
