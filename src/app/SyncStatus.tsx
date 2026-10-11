import type { OutboxState } from '../data/outbox';
import type { Connection } from '../data/sync';
import { useSync } from '../data/useSync';
import './SyncStatus.css';

type Tone = 'ok' | 'waiting' | 'problem';

const CONNECTION: Record<Connection, { readonly text: string; readonly tone: Tone }> = {
  unconfigured: { text: 'Not connected to a tournament server', tone: 'problem' },
  offline: { text: 'No signal', tone: 'waiting' },
  connecting: { text: 'Connecting…', tone: 'waiting' },
  live: { text: 'Live', tone: 'ok' },
  reconnecting: { text: 'Reconnecting…', tone: 'waiting' },
  refused: { text: 'This phone could not be signed in', tone: 'problem' },
};

export interface StatusLine {
  readonly text: string;
  readonly tone: Tone;
  /** Worth a banner: something is wrong or waiting. Live, or simply starting up, is not. */
  readonly shown: boolean;
}

/** Is this phone up to date, and is anything waiting to send? */
export function statusLine(connection: Connection, outbox: OutboxState): StatusLine {
  const waiting = outbox.items.filter((item) => item.failure === null).length;
  const refused = outbox.items.length - waiting;
  const base = CONNECTION[connection];
  const parts = [connection === 'live' && waiting > 0 ? `Sending ${String(waiting)}…` : base.text];
  if (connection !== 'live' && waiting > 0) parts.push(`${String(waiting)} waiting to send`);
  if (refused > 0) parts.push(`${String(refused)} not accepted`);
  const tone = refused > 0 ? 'problem' : base.tone;
  const quiet = connection === 'live' || connection === 'connecting';
  return { text: parts.join(' · '), tone, shown: !quiet || waiting > 0 || refused > 0 };
}

export function useStatusLine(): StatusLine {
  const connection = useSync((s) => s.connection);
  const outbox = useSync((s) => s.outbox);
  return statusLine(connection, outbox);
}

/**
 * The old app's banner at the top of every screen, shown only when there is
 * something to say. When there is not, the words stay for screen readers.
 */
export function SyncStatus() {
  const { text, tone, shown } = useStatusLine();
  return (
    <p className={shown ? `sync-status sync-status--${tone}` : 'visually-hidden'} role="status">
      {text}
    </p>
  );
}
