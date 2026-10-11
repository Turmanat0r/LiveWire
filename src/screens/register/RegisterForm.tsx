import { useId, useMemo, useState, type ReactNode, type SubmitEvent } from 'react';
import { failureText } from '../../app/failureText';
import { failureOf } from '../../data/remote';
import { ENTRY_TABLES } from '../../data/selectors';
import type { Row } from '../../data/tables';
import { useSync, useSyncEngine } from '../../data/useSync';
import { uniqueHandle } from '../../domain/handles';
import { looksLikeCode, normalizeCode, isCompletePhone } from '../../domain/identity';
import { dollarsText } from '../../domain/money';
import { EMPTY_FORM, formProblem, registrationArgs, type RegistrationForm } from './form';

function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: (id: string, hintId: string | undefined) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(id, hintId)}
      {hint ? (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Choice<T extends string | boolean>({
  legend,
  name,
  value,
  options,
  onChange,
  hint,
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: T | null;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
  readonly hint?: string;
}) {
  return (
    <div className="field">
      <fieldset className="choice">
        <legend className="field__label">{legend}</legend>
        {options.map((option) => (
          <label className="choice__option" key={String(option.value)}>
            <input
              type="radio"
              name={name}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

const RESIDENCY = [
  { value: true, label: 'Montana resident' },
  { value: false, label: 'Non-resident' },
] as const;

interface RegisterFormProps {
  readonly event: Row<'events'>;
  readonly closed: boolean;
  readonly lastDay: string;
}

export function RegisterForm({ event, closed, lastDay }: RegisterFormProps) {
  const sync = useSyncEngine();
  const anglers = useSync((s) => s.tables.anglers);
  const taken = useMemo(
    () => [...anglers.values()].filter((a) => a.event_id === event.id).map((a) => a.handle),
    [anglers, event.id],
  );
  const [form, setForm] = useState<RegistrationForm>(() => ({
    ...EMPTY_FORM,
    handle: uniqueHandle(taken),
  }));
  // Made once: a retry after an answer lost to the signal files the same entry.
  const [ids] = useState(() => ({
    entryId: crypto.randomUUID(),
    captainId: crypto.randomUUID(),
    partnerId: crypto.randomUUID(),
  }));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof RegistrationForm>(key: K, value: RegistrationForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function chooseDivision(division: 'solo' | 'team') {
    setForm((f) => ({
      ...f,
      division,
      partnerHandle:
        division === 'team' && !f.partnerHandle
          ? uniqueHandle([...taken, f.handle])
          : f.partnerHandle,
    }));
  }

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const wrong = formProblem(form);
    if (wrong) {
      setProblem(wrong);
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      await sync.call('register_entry', registrationArgs(form, ids, event.id));
      // Its signals bring the entry too; reading now shows it straight away.
      await sync.refresh(ENTRY_TABLES).catch(() => undefined);
    } catch (error) {
      setProblem(failureText(failureOf(error), 'Registering'));
    } finally {
      setBusy(false);
    }
  }

  const solo = dollarsText(event.fee_solo_cents);
  const team = dollarsText(event.fee_team_cents);
  const bigFish = dollarsText(event.fee_big_fish_cents);
  const bigFishTeam = dollarsText(event.fee_big_fish_cents * 2);

  return (
    <form className="card" onSubmit={(e) => void submit(e)} noValidate>
      <h2 className="card__title">Register</h2>
      {closed ? (
        <p className="notice">
          Registration closed on {lastDay}. Contact the tournament director if you still need to
          enter.
        </p>
      ) : null}
      <fieldset className="register__fields" disabled={closed || busy}>
        <Field label="Your name">
          {(id) => (
            <input
              id={id}
              type="text"
              autoComplete="name"
              placeholder="First and last name"
              value={form.fullName}
              onChange={(e) => {
                set('fullName', e.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Phone"
          hint="One entry per number. The director uses this to reach you if you are late back to the ramp. Nobody else on the water ever sees it."
        >
          {(id, hintId) => (
            <input
              id={id}
              type="tel"
              autoComplete="tel"
              placeholder="406-555-0100"
              aria-describedby={hintId}
              value={form.phone}
              onChange={(e) => {
                set('phone', e.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Emergency contact">
          {(id) => (
            <input
              id={id}
              type="text"
              placeholder="Name of someone not on the water"
              value={form.emergencyName}
              onChange={(e) => {
                set('emergencyName', e.target.value);
              }}
            />
          )}
        </Field>
        <Field
          label="Emergency contact phone"
          hint="Only the director ever sees this, and only if you are overdue off the water. Pick someone who is not fishing with you."
        >
          {(id, hintId) => (
            <input
              id={id}
              type="tel"
              placeholder="406-555-0102"
              aria-describedby={hintId}
              value={form.emergencyPhone}
              onChange={(e) => {
                set('emergencyPhone', e.target.value);
              }}
            />
          )}
        </Field>
        <Choice
          legend="Montana resident?"
          name="resident"
          value={form.resident}
          options={RESIDENCY}
          onChange={(v) => {
            set('resident', v);
          }}
          hint="For the state’s contest report only. It has no bearing on entry, scoring or payouts."
        />
        <Choice
          legend="Division"
          name="division"
          value={form.division}
          options={[
            { value: 'solo', label: `Solo · ${solo}` },
            { value: 'team', label: `Team · ${team}` },
          ]}
          onChange={chooseDivision}
        />
        {form.division === 'team' ? (
          <>
            <Field label="Partner name">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  placeholder="Partner’s first and last name"
                  value={form.partnerName}
                  onChange={(e) => {
                    set('partnerName', e.target.value);
                  }}
                />
              )}
            </Field>
            <Field
              label="Partner phone (optional)"
              hint="Worth adding: you two may not stay within sight of each other, and it is the only way the director can reach your partner directly."
            >
              {(id, hintId) => (
                <input
                  id={id}
                  type="tel"
                  placeholder="406-555-0101"
                  aria-describedby={hintId}
                  value={form.partnerPhone}
                  onChange={(e) => {
                    set('partnerPhone', e.target.value);
                  }}
                />
              )}
            </Field>
            <Choice
              legend="Is your partner a Montana resident?"
              name="partner-resident"
              value={form.partnerResident}
              options={RESIDENCY}
              onChange={(v) => {
                set('partnerResident', v);
              }}
            />
          </>
        ) : null}
        <label className="tick">
          <input
            type="checkbox"
            checked={form.bigFish}
            onChange={(e) => {
              set('bigFish', e.target.checked);
            }}
          />
          Enter the Big Fish side pot: {bigFish} an angler ({bigFishTeam} for a team), winner take
          all
        </label>
        <div className="handle-field">
          <p className="field__label">Pick your competitor handle</p>
          <HandlePick
            who={form.division === 'team' ? 'You' : null}
            handle={form.handle}
            onReroll={() => {
              set('handle', uniqueHandle([...taken, form.partnerHandle]));
            }}
          />
          {form.division === 'team' ? (
            <HandlePick
              who="Partner"
              handle={form.partnerHandle}
              onReroll={() => {
                set('partnerHandle', uniqueHandle([...taken, form.handle]));
              }}
            />
          ) : null}
          <p className="hint">
            <strong>This is the name everyone else sees you as.</strong> Reroll until you like it.
            It is fixed once you register, and only the director can change it afterwards. Standings
            and payouts still use your real name.
          </p>
        </div>
      </fieldset>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={closed || busy}>
        {busy ? 'Registering…' : 'Complete registration'}
      </button>
      <p className="hint">
        Registration closes {lastDay}. This confirms your spot on the roster: entry fees and side
        pot buy-ins are collected separately by PayPal, per the info in your confirmation email.
      </p>
    </form>
  );
}

function HandlePick({
  who,
  handle,
  onReroll,
}: {
  readonly who: string | null;
  readonly handle: string;
  readonly onReroll: () => void;
}) {
  return (
    <div className="handle-pick">
      <p className="handle-pick__name">
        {who ? <span className="handle-pick__who">{who}</span> : null}
        <output aria-live="polite">{handle}</output>
      </p>
      <button
        className="button button--small"
        type="button"
        onClick={onReroll}
        aria-label={who ? `Roll a new handle: ${who.toLowerCase()}` : 'Roll a new handle'}
      >
        Reroll
      </button>
    </div>
  );
}

/** "Already registered on another phone?" Bring the entry over with its codes. */
export function ClaimEntry() {
  const sync = useSyncEngine();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!looksLikeCode(code)) {
      setProblem('A Tournament ID is four letters and numbers, like 7K4M.');
      return;
    }
    if (!isCompletePhone(phone)) {
      setProblem('Enter the phone number you registered with, area code included.');
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const found = await sync.call('claim_entry', { p_code: normalizeCode(code), p_phone: phone });
      if (found === null) {
        setProblem(
          'No entry matches that Tournament ID and phone number. Check both and try again.',
        );
        return;
      }
      await sync.refresh(ENTRY_TABLES).catch(() => undefined);
    } catch (error) {
      setProblem(failureText(failureOf(error), 'Bringing your entry over'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="claim-title">
      <h2 className="card__title" id="claim-title">
        Already registered on another phone?
      </h2>
      <p className="hint">Do not register again. Bring your entry over instead.</p>
      {open ? (
        <form className="claim" onSubmit={(e) => void submit(e)} noValidate>
          <fieldset className="register__fields" disabled={busy}>
            <Field label="Tournament ID">
              {(id) => (
                <input
                  id={id}
                  className="claim__code"
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={8}
                  placeholder="7K4M"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                  }}
                />
              )}
            </Field>
            <Field label="Phone you registered with">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  autoComplete="tel"
                  placeholder="406-555-0100"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                  }}
                />
              )}
            </Field>
          </fieldset>
          {problem ? (
            <p className="err" role="alert">
              {problem}
            </p>
          ) : null}
          <div className="actions">
            <button className="button" type="submit" disabled={busy}>
              {busy ? 'Looking for it…' : 'Bring my entry over'}
            </button>
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                setOpen(false);
                setProblem(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            setOpen(true);
          }}
        >
          Sign in to my entry
        </button>
      )}
    </section>
  );
}
