import { useId, useState } from 'react';
import { failureText } from '../../app/failureText';
import { screen } from '../../app/screens';
import { useNow } from '../../app/useNow';
import { useReviewItems } from '../../data/director';
import { useMyEntry } from '../../data/myEntry';
import { failureOf } from '../../data/remote';
import { useSync, useSyncEngine } from '../../data/useSync';
import { Page } from '../../ui/Page';
import { OverdueAlert } from './OverdueAlert';
import { ReviewLists } from './ReviewLists';
import '../../ui/forms.css';
import './director.css';

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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = items.filter((i) => i.row.status === 'pending').length;

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
    <Page
      title={screen('director').title}
      before={<OverdueAlert now={now} />}
      after={<ReviewLists items={items} />}
    >
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
    </Page>
  );
}
