import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { screen } from '../../app/screens';
import { useMyEntry, type EntryAngler } from '../../data/myEntry';
import { useSync, useSyncEngine } from '../../data/useSync';
import { Page } from '../../ui/Page';
import { catchLabel, parseLength } from '../catch/filing';
import { CatchCard, lengthText, PhotoThumb } from './CatchCard';
import { catchRows, type CatchRow } from './catchRows';
import '../../ui/forms.css';

/** Who the list is for: the phone's own angler, or on a team either one. */
export function AnglerPick({
  anglers,
  value,
  onChange,
}: {
  readonly anglers: readonly EntryAngler[];
  readonly value: string;
  readonly onChange: (id: string) => void;
}) {
  const id = useId();
  if (anglers.length < 2) return null;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        Angler
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {anglers.map((a) => (
          <option key={a.angler.id} value={a.angler.id}>
            {a.details?.full_name ? `${a.details.full_name} (${a.angler.handle})` : a.angler.handle}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Everything filed from this entry, and where each one stands. While a catch
 * is pending review its length can be put right, or it can be withdrawn;
 * once the director has ruled, it is theirs.
 */
export function MyCatchesScreen() {
  const mine = useMyEntry();
  const catches = useSync((s) => s.tables.catches);
  const outbox = useSync((s) => s.outbox);
  const [chosen, setChosen] = useState<string | null>(null);
  const title = screen('my-catches').title;
  const anglerId = chosen ?? mine?.me.angler.id ?? '';
  const rows = useMemo(
    () => catchRows(catches.values(), outbox.items, anglerId),
    [catches, outbox.items, anglerId],
  );
  if (!mine) {
    return (
      <Page title={title}>
        <p className="empty">Sign in to your entry to see and edit your catches.</p>
        <Link className="button button--secondary" to={screen('register').path}>
          Register
        </Link>
      </Page>
    );
  }
  return (
    <Page title={title}>
      <AnglerPick anglers={mine.anglers} value={anglerId} onChange={setChosen} />
      {rows.length === 0 ? (
        <>
          <p className="empty">No catches submitted yet.</p>
          <Link className="button button--secondary" to={screen('catch').path}>
            Submit a catch
          </Link>
        </>
      ) : (
        <ul className="catch-list">
          {rows.map((row) => (
            <MyCatch key={row.id} row={row} />
          ))}
        </ul>
      )}
      <p className="hint">
        You can fix the length or withdraw a catch while it is pending review. Once the director
        approves or rejects it, see the director to change it.
      </p>
    </Page>
  );
}

function MyCatch({ row }: { readonly row: CatchRow }) {
  const sync = useSyncEngine();
  const [length, setLength] = useState(String(row.newLength ?? row.lengthInches));
  const [problem, setProblem] = useState<string | null>(null);
  const label = catchLabel(row.species, row.lengthInches);
  const editId = useId();

  function saveLength() {
    const inches = parseLength(length);
    if (inches === null) {
      setProblem('Enter the length in inches, as read off the board.');
      return;
    }
    setProblem(null);
    void sync.queue({
      id: crypto.randomUUID(),
      label: `${row.species}: length now ${String(inches)} in`,
      createdAt: Date.now(),
      steps: [
        { kind: 'call', fn: 'amend_catch_length', args: { p_id: row.id, p_length_inches: inches } },
      ],
    });
  }

  function withdraw() {
    if (!row.photoPath) return;
    const sure = window.confirm(
      'Withdraw this catch? It is removed along with its photo, and cannot be brought back.',
    );
    if (!sure) return;
    // The photo first, while the catch is still pending: the photo store only
    // lets this phone remove the photo of its own pending catch.
    void sync.queue({
      id: crypto.randomUUID(),
      label: `Withdraw ${label}`,
      createdAt: Date.now(),
      steps: [
        { kind: 'remove', path: row.photoPath },
        {
          kind: 'call',
          fn: 'withdraw_catch',
          args: { p_id: row.id },
          alreadyDone: ['catch_not_found'],
        },
      ],
    });
  }

  const notes: string[] = [];
  if (row.status === 'waiting') notes.push('Kept on this phone until there is signal.');
  else if (row.photoSending) notes.push('Photo still sending.');
  if (row.newLength !== null)
    notes.push(`Length changing to ${lengthText(row.newLength)}: waiting to send.`);
  if (row.withdrawing) notes.push('Withdrawing: waiting to send.');

  return (
    <CatchCard
      photo={
        <PhotoThumb
          path={row.photoPath}
          itemId={row.waiting?.id ?? null}
          alt={`${row.species}, ${String(row.lengthInches)} inches`}
        />
      }
      lengthInches={row.newLength ?? row.lengthInches}
      status={row.status}
      title={row.species}
    >
      {notes.map((note) => (
        <p className="catch-card__note" key={note}>
          {note}
        </p>
      ))}
      {row.refused.map((item) => (
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
      {row.status === 'waiting' && row.waiting?.failure === null ? (
        <button
          className="button button--small"
          type="button"
          onClick={() => {
            if (row.waiting && window.confirm('Cancel this catch? It has not been sent yet.')) {
              void sync.outbox.discard(row.waiting);
            }
          }}
        >
          Cancel this catch
        </button>
      ) : null}
      {row.status === 'pending' && !row.withdrawing ? (
        <div className="catch-card__edit">
          <label className="visually-hidden" htmlFor={editId}>
            Length in inches
          </label>
          <input
            id={editId}
            type="number"
            inputMode="decimal"
            step="0.25"
            value={length}
            onChange={(e) => {
              setLength(e.target.value);
            }}
          />
          <button className="button button--small" type="button" onClick={saveLength}>
            Save length
          </button>
          <button className="button button--small button--danger" type="button" onClick={withdraw}>
            Withdraw
          </button>
        </div>
      ) : null}
      {row.status === 'approved' || row.status === 'rejected' ? (
        <p className="catch-card__note">Locked: the director has ruled on it.</p>
      ) : null}
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
    </CatchCard>
  );
}
