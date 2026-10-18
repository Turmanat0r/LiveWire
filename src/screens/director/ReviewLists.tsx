import { useId, useMemo, useState } from 'react';
import type { ReviewItem } from '../../data/director';
import type { OutboxItem } from '../../data/local';
import type { Row } from '../../data/tables';
import { useSync, useSyncEngine } from '../../data/useSync';
import type { FirstPass } from '../../domain/review';
import { Card } from '../../ui/Card';
import { CatchPhoto, PhotoViewer } from '../../ui/PhotoViewer';
import { parseLength } from '../catch/filing';
import { StatusBadge } from '../catches/CatchCard';
import { inchesText } from '../board/StandingsScreen';
import { locationBadge } from '../safety/words';
import '../catches/catches.css';

type Status = Row<'catches'>['status'];

/**
 * A ruling or a correction still in the outbox shows at once, so the queue
 * moves as fast as the director does, signal or not.
 */
function overlay(item: ReviewItem, queued: readonly OutboxItem[]) {
  let status: Status = item.row.status;
  let species = item.row.species;
  let length = item.row.length_inches;
  let sending = false;
  for (const q of queued) {
    for (const step of q.steps) {
      if (step.kind !== 'call' || step.args['p_id'] !== item.row.id) continue;
      sending = true;
      const a = step.args;
      if (step.fn === 'director_review_catch' && typeof a['p_status'] === 'string') {
        status = a['p_status'] as Status;
      }
      if (step.fn === 'director_correct_catch') {
        if (typeof a['p_species'] === 'string') species = a['p_species'];
        if (typeof a['p_length_inches'] === 'number') length = a['p_length_inches'];
      }
    }
  }
  return { status, species, length, sending };
}

interface Shown extends ReviewItem {
  readonly status: Status;
  readonly species: string;
  readonly length: number;
  readonly sending: boolean;
}

export function ReviewLists({ items }: { readonly items: readonly ReviewItem[] }) {
  const queued = useSync((s) => s.outbox.items);
  const shown: Shown[] = useMemo(
    () => items.map((i) => ({ ...i, ...overlay(i, queued) })),
    [items, queued],
  );
  // Oldest first: whoever has waited longest is looked at first.
  const pending = shown
    .filter((i) => i.status === 'pending')
    .sort((a, b) => a.review.fish.loggedAt - b.review.fish.loggedAt);
  const all = [...shown].sort((a, b) => b.review.fish.loggedAt - a.review.fish.loggedAt);
  const [viewing, setViewing] = useState<{ list: 'pending' | 'all'; id: string } | null>(null);
  const list = viewing?.list === 'pending' ? pending : all;

  return (
    <>
      <Card title="Fish to review">
        <p className="hint">Tap a photo to open it full size and judge it there.</p>
        {pending.length === 0 ? (
          <p className="empty">Nothing pending review.</p>
        ) : (
          <ul className="catch-list" aria-label="Pending catches">
            {pending.map((i) => (
              <ReviewCard
                key={i.row.id}
                item={i}
                onOpen={() => {
                  setViewing({ list: 'pending', id: i.row.id });
                }}
              />
            ))}
          </ul>
        )}
      </Card>
      <Card title="All catches">
        {all.length === 0 ? (
          <p className="empty">No catches submitted yet.</p>
        ) : (
          <ul className="catch-list" aria-label="All catches">
            {all.map((i) => (
              <ReviewCard
                key={i.row.id}
                item={i}
                showStatus
                onOpen={() => {
                  setViewing({ list: 'all', id: i.row.id });
                }}
              />
            ))}
          </ul>
        )}
      </Card>
      {viewing ? (
        <ReviewViewer
          list={list}
          id={viewing.id}
          onMove={(id) => {
            setViewing({ list: viewing.list, id });
          }}
          onClose={() => {
            setViewing(null);
          }}
        />
      ) : null}
    </>
  );
}

function useRule() {
  const sync = useSyncEngine();
  return (item: Shown, status: Status) => {
    void sync.queue({
      id: crypto.randomUUID(),
      label: `${status === 'approved' ? 'Approve' : status === 'rejected' ? 'Reject' : 'Reopen'} ${inchesText(item.length)} ${item.species}`,
      createdAt: Date.now(),
      steps: [
        {
          kind: 'call',
          fn: 'director_review_catch',
          args: { p_id: item.row.id, p_status: status, p_note: '' },
        },
      ],
    });
  };
}

function ReviewCard({
  item,
  showStatus = false,
  onOpen,
}: {
  readonly item: Shown;
  readonly showStatus?: boolean;
  readonly onOpen: () => void;
}) {
  const rule = useRule();
  const [fixing, setFixing] = useState(false);
  const division = item.row.division === 'team' ? 'Team' : 'Solo';
  const location = locationBadge(item.review.hasPosition, item.review.verdict);
  return (
    <li className="catch-card review-card">
      <button
        className="review-card__photo"
        type="button"
        aria-label={`Open the photo of ${item.review.anglerName}’s ${item.species} full size`}
        onClick={onOpen}
      >
        <CatchPhoto path={item.row.photo_path} alt="" />
      </button>
      <div className="catch-card__info">
        <p className="catch-card__top">
          <span className="catch-card__length">{inchesText(item.length)}</span>
          {showStatus ? <StatusBadge status={item.status} /> : null}
        </p>
        <p className="review-card__who">
          {item.review.anglerName} · {item.species} · {division}
        </p>
        <p className="review-card__badges">
          <span className={`loc-badge loc-badge--${location.tone}`}>{location.text}</span>
          {item.stamp.map((b) => (
            <span key={b.text} className={`stamp stamp--${b.tone}`}>
              {b.text}
            </span>
          ))}
          {item.filedBy ? <span className="stamp stamp--filed">{item.filedBy}</span> : null}
        </p>
        <FirstPassBlock pass={item.firstPass} />
        {item.sending ? <p className="catch-card__note">Waiting to send.</p> : null}
        {fixing ? (
          <FixForm
            item={item}
            onDone={() => {
              setFixing(false);
            }}
          />
        ) : (
          <div className="actions">
            {item.status === 'pending' ? (
              <>
                <button
                  className="button button--small"
                  type="button"
                  onClick={() => {
                    rule(item, 'approved');
                  }}
                >
                  Approve
                </button>
                <button
                  className="button button--small button--danger"
                  type="button"
                  onClick={() => {
                    rule(item, 'rejected');
                  }}
                >
                  Reject
                </button>
              </>
            ) : (
              <button
                className="button button--small"
                type="button"
                onClick={() => {
                  rule(item, 'pending');
                }}
              >
                Back to pending
              </button>
            )}
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                setFixing(true);
              }}
            >
              Fix length or species
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

const VERDICT = { clear: 'Clear', review: 'Look closer', flag: 'Needs review' } as const;

function FirstPassBlock({ pass }: { readonly pass: FirstPass }) {
  return (
    <div className={`fp fp--${pass.level}`}>
      <p className="fp__head">
        <span className="fp__title">Fish-I first pass</span>
        <span className={`fp__verdict fp__verdict--${pass.level}`}>{VERDICT[pass.level]}</span>
      </p>
      {pass.checks.length === 0 ? (
        <p className="fp__item">
          <span className="fp__dot fp__dot--info" aria-hidden="true" />
          <span>No issues found in the automatic checks.</span>
        </p>
      ) : (
        pass.checks.map((c) => (
          <p key={c.label} className="fp__item">
            <span className={`fp__dot fp__dot--${c.level}`} aria-hidden="true" />
            <span>
              <strong>{c.label}</strong>
              <br />
              {c.detail}
            </span>
          </p>
        ))
      )}
    </div>
  );
}

/** A misread board or the wrong species, put right before the ruling. */
function FixForm({ item, onDone }: { readonly item: Shown; readonly onDone: () => void }) {
  const sync = useSyncEngine();
  const event = useSync((s) => s.event);
  const speciesRows = useSync((s) => s.tables.event_species);
  const ids = { species: useId(), length: useId() };
  const names = [...speciesRows.values()]
    .filter((s) => s.event_id === event?.id)
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name);
  const options = [...new Set([...names, 'Other', item.species])];
  const [species, setSpecies] = useState(item.species);
  const [length, setLength] = useState(String(item.length));
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="review-card__fix">
      <div className="field">
        <label className="field__label" htmlFor={ids.species}>
          Species
        </label>
        <select
          id={ids.species}
          value={species}
          onChange={(e) => {
            setSpecies(e.target.value);
          }}
        >
          {options.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor={ids.length}>
          Length (inches)
        </label>
        <input
          id={ids.length}
          type="number"
          inputMode="decimal"
          step="0.25"
          value={length}
          onChange={(e) => {
            setLength(e.target.value);
          }}
        />
      </div>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="actions">
        <button
          className="button button--small"
          type="button"
          onClick={() => {
            const inches = parseLength(length);
            if (inches === null) {
              setProblem('Enter the length in inches, as read off the board.');
              return;
            }
            void sync.queue({
              id: crypto.randomUUID(),
              label: `Correct to ${inchesText(inches)} ${species}`,
              createdAt: Date.now(),
              steps: [
                {
                  kind: 'call',
                  fn: 'director_correct_catch',
                  args: { p_id: item.row.id, p_species: species, p_length_inches: inches },
                },
              ],
            });
            onDone();
          }}
        >
          Save
        </button>
        <button className="button button--small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * The photo, big: a thumbnail cannot show whether a tail is pinched or where
 * the nose sits on the tape, and that is the whole of the judgement. The same
 * rulings are on it, and the arrows walk the list it was opened from.
 */
function ReviewViewer({
  list,
  id,
  onMove,
  onClose,
}: {
  readonly list: readonly Shown[];
  readonly id: string;
  readonly onMove: (id: string) => void;
  readonly onClose: () => void;
}) {
  const rule = useRule();
  const items = list.map((shown) => ({
    id: shown.row.id,
    title: `${shown.review.anglerName} · ${inchesText(shown.length)} ${shown.species}`,
    path: shown.row.photo_path,
    shown,
  }));
  return (
    <PhotoViewer
      items={items}
      id={id}
      onMove={onMove}
      onClose={onClose}
      actions={(item) =>
        item.shown.status === 'pending'
          ? [
              {
                label: 'Approve',
                className: 'button viewer__approve',
                advance: true,
                onClick: () => {
                  rule(item.shown, 'approved');
                },
              },
              {
                label: 'Reject',
                className: 'button button--danger viewer__reject',
                advance: true,
                onClick: () => {
                  rule(item.shown, 'rejected');
                },
              },
            ]
          : []
      }
    />
  );
}
