import { useId, useState } from 'react';
import { parseDollars } from '../../domain/money';
import { Card } from '../../ui/Card';
import { PoolsBody } from '../board/PayoutsScreen';
import { centsText as money, splitText } from '../board/payouts';
import {
  TARGETS,
  targetLabel,
  type DirectorMoney,
  type DonationTarget,
  type DonationView,
} from './money';
import { useDirectorQueue } from './queue';
import '../board/board.css';

/** "250.00" for an amount input, or empty for nothing. */
function amountText(cents: number): string {
  return cents ? (cents / 100).toFixed(2) : '';
}

/**
 * The old app's payout calculator: every pool from the fees received and the
 * donations logged, what is still to come in, and the awards budget against
 * the total.
 */
export function PayoutTool({
  eventId,
  money: m,
}: {
  readonly eventId: string;
  readonly money: DirectorMoney;
}) {
  return (
    <Card title="Payout calculator">
      <p className="hint">
        Worked out from the entries whose fee you have marked received, plus the donations logged
        below. Each division uses a {splitText(m.shares)} split. Big Fish is winner take all.
      </p>
      <PoolsBody model={m.model} />
      <Outstanding m={m} />
      <hr className="divider" />
      <AwardsBudget key={m.budgetCents} eventId={eventId} m={m} />
      <hr className="divider" />
      <Donations eventId={eventId} list={m.donations} />
    </Card>
  );
}

/**
 * Director only, and deliberately not part of the pools above, which the
 * field's payout screen shows too: who has paid is between each angler and
 * the director.
 */
function Outstanding({ m }: { readonly m: DirectorMoney }) {
  const { owed, unpaid } = m;
  const bits = [
    owed.solo ? `${String(owed.solo)} solo` : null,
    owed.teams ? `${String(owed.teams)} team` : null,
    owed.bigFish ? `${String(owed.bigFish)} Big Fish` : null,
  ].filter((b) => b !== null);
  if (bits.length === 0) return null;
  return (
    <div className={`fp ${unpaid.length ? 'fp--flag' : 'fp--review'}`}>
      <p className="fp__head">
        <span className="fp__title">Fees outstanding · {money(owed.totalCents)}</span>
      </p>
      {unpaid.length ? (
        <p className="fp__item">
          <span className="fp__dot fp__dot--flag" aria-hidden="true" />
          <span>
            <strong>{unpaid.map((u) => `${u.names} (${u.why})`).join(', ')}</strong>{' '}
            {unpaid.length === 1 ? 'is' : 'are'} in the money with no fee matched. Settle that
            before you pay anyone out.
          </span>
        </p>
      ) : null}
      <p className="fp__item">
        <span className="fp__dot fp__dot--review" aria-hidden="true" />
        <span>
          {bits.join(', ')}: not counted in the pools above, so those figures are what has actually
          arrived. Tick them off under Contestants as the money lands.
        </span>
      </p>
    </div>
  );
}

function AwardsBudget({ eventId, m }: { readonly eventId: string; readonly m: DirectorMoney }) {
  const queue = useDirectorQueue();
  const id = useId();
  const [text, setText] = useState(amountText(m.budgetCents));
  const [problem, setProblem] = useState<string | null>(null);
  const net = m.raisedCents - m.budgetCents;

  function save() {
    const cents = parseDollars(text || '0');
    if (cents === null) {
      setProblem('Enter the budget in dollars, like 250 or 250.00.');
      return;
    }
    setProblem(null);
    if (cents === m.budgetCents) return;
    queue(`Awards budget ${money(cents)}`, [
      {
        kind: 'call',
        fn: 'director_set_awards_budget',
        args: { p_event_id: eventId, p_cents: cents },
      },
    ]);
  }

  return (
    <section className="money-part" aria-labelledby={`${id}-head`}>
      <h3 className="card__subtitle" id={`${id}-head`}>
        Planned awards budget
      </h3>
      <p className="hint">
        What you plan to spend on trophies, plaques or other hardware, kept separate from the cash
        pools above. The anglers’ screens do not show it.
      </p>
      <form
        className="money-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={id}>
            Awards budget ($)
          </label>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
        </div>
        <button className="button button--small" type="submit">
          Save budget
        </button>
      </form>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <div>
        <div className="lbrow">
          <span className="lbrow__who">
            <span className="lbrow__name">Total raised</span>
          </span>
          <span className="lbrow__len">{money(m.raisedCents)}</span>
        </div>
        <div className="lbrow">
          <span className="lbrow__who">
            <span className="lbrow__name">Awards budget</span>
          </span>
          <span className="lbrow__len">{money(-m.budgetCents)}</span>
        </div>
        <div className="lbrow">
          <span className="lbrow__who">
            <strong className="lbrow__name">Net cash for payouts</strong>
          </span>
          <span className="lbrow__len">{money(net)}</span>
        </div>
      </div>
      {net < 0 ? (
        <p className="err">The awards budget is more than the tournament has raised.</p>
      ) : null}
    </section>
  );
}

function Donations({
  eventId,
  list,
}: {
  readonly eventId: string;
  readonly list: readonly DonationView[];
}) {
  const queue = useDirectorQueue();
  const id = useId();
  return (
    <section className="money-part" aria-labelledby={`${id}-head`}>
      <h3 className="card__subtitle" id={`${id}-head`}>
        Add a donation
      </h3>
      <p className="hint">
        Log sponsor or spectator donations here to add them to a pool’s payout. This only tracks the
        amount: collect the money the same way as entry fees.
      </p>
      <DonationForm
        submit="Add donation"
        onSubmit={(target, cents, note) => {
          queue(`Donation ${money(cents)} to the ${targetLabel(target).toLowerCase()}`, [
            {
              kind: 'call',
              fn: 'director_record_donation',
              args: {
                p_id: crypto.randomUUID(),
                p_event_id: eventId,
                p_target: target,
                p_amount_cents: cents,
                p_note: note,
              },
            },
          ]);
        }}
      />
      {list.length === 0 ? (
        <p className="hint">No donations logged yet.</p>
      ) : (
        <ul className="dons" aria-label="Donations">
          {list.map((d) => (
            <DonationRow key={d.id} d={d} eventId={eventId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function DonationRow({ d, eventId }: { readonly d: DonationView; readonly eventId: string }) {
  const queue = useDirectorQueue();
  const [editing, setEditing] = useState(false);
  const what = `${money(d.cents)} donation to the ${targetLabel(d.target).toLowerCase()}`;
  if (editing) {
    return (
      <li className="don don--editing">
        <DonationForm
          start={d}
          submit="Save"
          onCancel={() => {
            setEditing(false);
          }}
          onSubmit={(target, cents, note) => {
            setEditing(false);
            if (target === d.target && cents === d.cents && note === d.note) return;
            // There is no editing a donation on the server: the old one goes
            // and the corrected one is logged in its place, in one go.
            queue(`Corrected ${what}`, [
              { kind: 'call', fn: 'director_delete_donation', args: { p_id: d.id } },
              {
                kind: 'call',
                fn: 'director_record_donation',
                args: {
                  p_id: crypto.randomUUID(),
                  p_event_id: eventId,
                  p_target: target,
                  p_amount_cents: cents,
                  p_note: note,
                },
              },
            ]);
          }}
        />
      </li>
    );
  }
  return (
    <li className="don">
      <span className="don__what">
        <span className="don__amount">
          <strong>{money(d.cents)}</strong> · {targetLabel(d.target)}
        </span>
        {d.note ? <span className="don__note">{d.note}</span> : null}
        {d.sending ? <span className="don__note">Waiting to send.</span> : null}
      </span>
      <span className="actions">
        <button
          className="button button--small"
          type="button"
          onClick={() => {
            setEditing(true);
          }}
        >
          Edit
        </button>
        <button
          className="button button--small button--danger"
          type="button"
          onClick={() => {
            if (!window.confirm(`Remove the ${what}? It comes out of the pool.`)) return;
            queue(`Removed ${what}`, [
              { kind: 'call', fn: 'director_delete_donation', args: { p_id: d.id } },
            ]);
          }}
        >
          Remove
        </button>
      </span>
    </li>
  );
}

function DonationForm({
  start,
  submit,
  onSubmit,
  onCancel,
}: {
  readonly start?: DonationView;
  readonly submit: string;
  readonly onSubmit: (target: DonationTarget, cents: number, note: string) => void;
  readonly onCancel?: () => void;
}) {
  const ids = { target: useId(), amount: useId(), note: useId() };
  const [target, setTarget] = useState<DonationTarget>(start?.target ?? 'general');
  const [amount, setAmount] = useState(amountText(start?.cents ?? 0));
  const [note, setNote] = useState(start?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="don-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const cents = parseDollars(amount);
        if (!cents) {
          setProblem('Enter a donation amount greater than $0.');
          return;
        }
        setProblem(null);
        onSubmit(target, cents, note.trim());
        if (!start) {
          setAmount('');
          setNote('');
        }
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor={ids.target}>
          Add to
        </label>
        <select
          id={ids.target}
          value={target}
          onChange={(e) => {
            const picked = TARGETS.find((t) => t.id === e.target.value);
            if (picked) setTarget(picked.id);
          }}
        >
          {TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.long}
            </option>
          ))}
        </select>
      </div>
      <div className="don-form__pair">
        <div className="field">
          <label className="field__label" htmlFor={ids.amount}>
            Amount ($)
          </label>
          <input
            id={ids.amount}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="25.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.note}>
            From / note (optional)
          </label>
          <input
            id={ids.note}
            type="text"
            maxLength={200}
            placeholder="Sponsor name"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
          />
        </div>
      </div>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="actions">
        <button className="button button--secondary" type="submit">
          {submit}
        </button>
        {onCancel ? (
          <button className="button button--small" type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
