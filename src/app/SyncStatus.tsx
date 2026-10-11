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

/** The line at the top of every screen: is this phone up to date, and is anything waiting to send? */
export function statusLine(
  connection: Connection,
  outbox: OutboxState,
): { text: string; tone: Tone } {
  const waiting = outbox.items.filter((item) => item.failure === null).length;
  const refused = outbox.items.length - waiting;
  const base = CONNECTION[connection];
  const parts = [connection === 'live' && waiting > 0 ? `Sending ${String(waiting)}…` : base.text];
  if (connection !== 'live' && waiting > 0) parts.push(`${String(waiting)} waiting to send`);
  if (refused > 0) parts.push(`${String(refused)} not accepted`);
  return { text: parts.join(' · '), tone: refused > 0 ? 'problem' : base.tone };
}

export function SyncStatus() {
  const connection = useSync((s) => s.connection);
  const outbox = useSync((s) => s.outbox);
  const { text, tone } = statusLine(connection, outbox);
  return (
    <p className={`sync-status sync-status--${tone}`} role="status">
      {text}
    </p>
  );
}
