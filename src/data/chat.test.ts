import { describe, expect, it } from 'vitest';
import { EVENT_ID } from '../test/rows';
import { chatFeed, chatWhen, unreadCount } from './chat';
import type { OutboxItem } from './local';
import type { Row } from './tables';

const at = (minute: number) => new Date(Date.UTC(2027, 8, 18, 16, minute)).toISOString();

function message(id: string, minute: number, over: Partial<Row<'messages'>> = {}): Row<'messages'> {
  return {
    id,
    event_id: EVENT_ID,
    angler_id: 'a1',
    handle: 'Salty Bedrock Perch',
    kind: 'chat',
    body: `message ${id}`,
    catch_id: null,
    reply_to: null,
    created_at: at(minute),
    ...over,
  };
}

let seq = 0;
function outbox(fn: 'post_message' | 'delete_message', args: Record<string, string | null>) {
  seq += 1;
  return {
    seq,
    id: `i${String(seq)}`,
    label: fn,
    createdAt: Date.parse(at(30)),
    attempts: 0,
    failure: null,
    steps: [{ kind: 'call', fn, args }],
  } satisfies OutboxItem;
}

const anglers: Row<'anglers'>[] = [
  {
    id: 'me',
    entry_id: 'n1',
    event_id: EVENT_ID,
    role: 'solo',
    handle: 'Soggy Granite Walleye',
    big_fish: false,
    disqualified: false,
    registered_at: at(0),
  },
];

describe('the chat feed', () => {
  it('puts the newest conversation first and its replies oldest first underneath', () => {
    const feed = chatFeed(
      [
        message('old', 1),
        message('new', 5),
        message('r2', 9, { reply_to: 'old' }),
        message('r1', 7, { reply_to: 'old' }),
      ],
      [],
      anglers,
      EVENT_ID,
    );
    expect(feed.map((p) => [p.id, p.replies.map((r) => r.id)])).toEqual([
      ['new', []],
      ['old', ['r1', 'r2']],
    ]);
  });

  it('shows a post still waiting to send, under this phone’s handle, and once only', () => {
    const waiting = outbox('post_message', {
      p_id: 'm9',
      p_angler_id: 'me',
      p_body: 'Fish on',
      p_reply_to: null,
    });
    const [post] = chatFeed([], [waiting], anglers, EVENT_ID);
    expect(post).toMatchObject({ id: 'm9', handle: 'Soggy Granite Walleye', sending: true });
    // Sent, but the outbox has not caught up yet: the server's copy wins.
    const both = chatFeed([message('m9', 31)], [waiting], anglers, EVENT_ID);
    expect(both).toHaveLength(1);
    expect(both[0]?.sending).toBe(false);
  });

  it('drops a post being deleted, with its replies', () => {
    const feed = chatFeed(
      [message('p', 1), message('r', 2, { reply_to: 'p' }), message('q', 3)],
      [outbox('delete_message', { p_id: 'p' })],
      anglers,
      EVENT_ID,
    );
    expect(feed.map((p) => p.id)).toEqual(['q']);
  });

  it('counts what is new since this phone last looked, but not its own posts', () => {
    const rows = [message('a', 1), message('b', 5, { angler_id: 'me' }), message('c', 9)];
    expect(unreadCount(rows, EVENT_ID, Date.parse(at(2)), new Set(['me']))).toBe(1);
    expect(unreadCount(rows, EVENT_ID, 0, new Set())).toBe(3);
  });

  it('says when, as the old app did', () => {
    const now = Date.parse(at(50));
    expect(chatWhen(now - 20_000, now, 'America/Denver')).toBe('just now');
    expect(chatWhen(now - 12 * 60_000, now, 'America/Denver')).toBe('12m ago');
    expect(chatWhen(Date.parse(at(0)) - 3 * 3_600_000, now, 'America/Denver')).toMatch(
      /^7:00\sAM$/,
    );
    expect(chatWhen(now - 3 * 86_400_000, now, 'America/Denver')).toBe('Sep 15');
  });
});
