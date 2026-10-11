import { describe, expect, it } from 'vitest';
import type { OutboxItem } from '../data/local';
import type { OutboxState } from '../data/outbox';
import { statusLine } from './SyncStatus';

function item(failure: OutboxItem['failure'] = null): OutboxItem {
  return { seq: 1, id: 'x', label: 'x', createdAt: 0, steps: [], attempts: 0, failure };
}

function outbox(...items: OutboxItem[]): OutboxState {
  return { items, sending: false, paused: null };
}

describe('the status line', () => {
  it('says live when nothing is waiting', () => {
    expect(statusLine('live', outbox())).toEqual({ text: 'Live', tone: 'ok' });
  });

  it('counts what is waiting to send with no signal', () => {
    expect(statusLine('offline', outbox(item(), item()))).toEqual({
      text: 'No signal · 2 waiting to send',
      tone: 'waiting',
    });
  });

  it('says it is sending once signal is back', () => {
    expect(statusLine('live', outbox(item())).text).toBe('Sending 1…');
  });

  it('flags anything the server would not accept', () => {
    expect(statusLine('live', outbox(item({ key: 'event_closed', detail: '' })))).toEqual({
      text: 'Live · 1 not accepted',
      tone: 'problem',
    });
  });
});
