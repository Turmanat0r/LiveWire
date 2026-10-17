import { useId, useState } from 'react';
import { failureText } from '../../app/failureText';
import { screen } from '../../app/screens';
import { useNow } from '../../app/useNow';
import { useEventDates } from '../../data/selectors';
import { dateRangeText } from '../../domain/time';
import { signalAgeMinutes, SIGNAL_STALE_MINUTES } from '../../domain/safety';
import { useContestants, usePositions, useReviewItems } from '../../data/director';
import { useMyEntry } from '../../data/myEntry';
import { failureOf } from '../../data/remote';
import { useSync, useSyncEngine } from '../../data/useSync';
import { Icon, type IconName } from '../../ui/Icon';
import { Page } from '../../ui/Page';
import { useSearchParams } from 'react-router';
import { centsText } from '../board/payouts';
import { Contestants } from './Contestants';
import { useDirectorMoney } from './money';
import { OverdueAlert } from './OverdueAlert';
import { EventTool } from './EventTool';
import { PayoutTool } from './PayoutTool';
import { PositionsTool } from './PositionsTool';
import { ReviewLists } from './ReviewLists';
import '../../ui/forms.css';
import './director.css';

const TOOLS = ['review', 'contestants', 'positions', 'payouts', 'event'] as const;
type Tool = (typeof TOOLS)[number];

/**
 * The tournament director's screens. Signing in is what lets the server
 * accept director changes: it is tied to the director's account, not to the
 * phone, and the database checks it on every change.
 */
export function DirectorScreen() {
  const director = useSync((s) => s.director);
  return director ? <DirectorPanel /> : <SignIn />;
}

function SignIn() {
  const sync = useSyncEngine();
  const mine = useMyEntry();
  const ids = { email: useId(), password: useId() };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function signIn() {
    if (!email.trim() || !password) {
      setProblem('Enter the director’s email and password.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await sync.signInDirector(email.trim(), password);
      setPassword('');
    } catch (error) {
      const failure = failureOf(error);
      setProblem(
        failure.kind === 'refused' && failure.key === 'invalid_credentials'
          ? 'That email and password do not match the director’s account.'
          : failureText(failure, 'Signing in'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={screen('director').title}>
      <p className="hint">
        Tournament director sign-in. Signing in is what lets the tournament server accept director
        changes. It is tied to your account, not to this phone.
      </p>
      {mine ? (
        <p className="notice">
          <strong>This phone holds an angler’s entry</strong>
          Signing in as the director replaces its angler sign-in. Afterwards, bring the entry back
          from Register with its Tournament ID and phone number.
        </p>
      ) : null}
      <form
        className="director-sign-in"
        onSubmit={(e) => {
          e.preventDefault();
          void signIn();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor={ids.email}>
            Email
          </label>
          <input
            id={ids.email}
            type="email"
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.password}>
            Password
          </label>
          <input
            id={ids.password}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </div>
        {problem ? (
          <p className="err" role="alert">
            {problem}
          </p>
        ) : null}
        <button className="button button--secondary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Page>
  );
}

function DirectorPanel() {
  const sync = useSyncEngine();
  const email = useSync((s) => s.email);
  const now = useNow();
  const items = useReviewItems();
  const contestants = useContestants();
  const money = useDirectorMoney(contestants);
  const placed = usePositions();
  const raised = placed.rows.filter((p) => p.beacon).length;
  const recent = placed.rows.filter(
    (p) => signalAgeMinutes(p.at, now) <= SIGNAL_STALE_MINUTES,
  ).length;
  const [params, setParams] = useSearchParams();
  const tool: Tool = TOOLS.find((t) => t === params.get('tool')) ?? 'review';
  const event = useSync((s) => s.event);
  const dates = useEventDates(event);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = items.filter((i) => i.row.status === 'pending').length;
  const owing = contestants.filter((c) => !c.feePaid).length;
  const dq = contestants.filter((c) => c.disqualified).length;
  const tools: readonly {
    id: Tool;
    icon: IconName;
    label: string;
    summary: string;
    alert?: boolean;
  }[] = [
    {
      id: 'review',
      icon: 'review',
      label: 'Fish to review',
      summary: waiting === 0 ? 'Nothing waiting' : `${String(waiting)} waiting`,
    },
    {
      id: 'contestants',
      icon: 'contestants',
      label: 'Contestants',
      summary:
        contestants.length === 0
          ? 'No anglers yet'
          : `${String(contestants.length)} angler${contestants.length === 1 ? '' : 's'}` +
            (owing ? ` · ${String(owing)} fee outstanding` : '') +
            (dq ? ` · ${String(dq)} DQ` : ''),
    },
    {
      id: 'positions',
      icon: 'positions',
      label: 'Positions',
      summary: raised
        ? `${String(raised)} beacon${raised === 1 ? '' : 's'} raised`
        : placed.rows.length === 0
          ? 'No positions yet'
          : `${String(recent)} recent of ${String(placed.rows.length)}`,
      alert: raised > 0,
    },
    {
      id: 'payouts',
      icon: 'payouts',
      label: 'Payout calculator',
      summary: money ? `${centsText(money.raisedCents)} across current pools` : 'No event yet',
    },
    {
      id: 'event',
      icon: 'event',
      label: 'Event',
      summary: event
        ? [event.name, dateRangeText(dates)].filter(Boolean).join(' · ')
        : 'No live event: set one up',
    },
  ];
  const panel =
    tool === 'contestants' ? (
      <Contestants list={contestants} />
    ) : tool === 'positions' ? (
      <PositionsTool placed={placed} />
    ) : tool === 'event' ? (
      <EventTool />
    ) : tool === 'payouts' ? (
      money && event ? (
        <PayoutTool eventId={event.id} money={money} />
      ) : null
    ) : (
      <ReviewLists items={items} />
    );

  async function signOut() {
    setBusy(true);
    setProblem(null);
    try {
      await sync.signOutDirector();
    } catch (error) {
      setProblem(failureText(failureOf(error), 'Signing out'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title={screen('director').title} before={<OverdueAlert now={now} />} after={panel}>
      <p className="hint">
        Signed in as the tournament director{email ? ` (${email})` : ''}.{' '}
        {waiting === 0
          ? 'Nothing waiting for review.'
          : `${String(waiting)} fish waiting for review.`}
      </p>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button
        className="button button--small"
        type="button"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      <ul className="director-tools" aria-label="Director’s tools">
        {tools.map((t) => (
          <li key={t.id}>
            <button
              className={t.alert ? 'director-tool director-tool--alert' : 'director-tool'}
              type="button"
              aria-pressed={tool === t.id}
              onClick={() => {
                setParams({ tool: t.id }, { replace: true });
              }}
            >
              <Icon name={t.icon} />
              <span className="director-tool__copy">
                <strong>{t.label}</strong>
                <span>{t.summary}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}
