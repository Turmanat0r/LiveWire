// The tournament chat: the server's messages with this phone's own posts that
// are still in the outbox laid over them, threaded one level deep. Posting
// goes through the outbox, so a post made with no signal waits and sends.
import { useMemo, useSyncExternalStore } from 'react';
import type { OutboxItem } from './local';
import { useMyEntry } from './myEntry';
import type { Row } from './tables';
import { useSync } from './useSync';

export const CHAT_MAX = 280;

export interface ChatPost {
  readonly id: string;
  readonly anglerId: string | null;
  readonly handle: string;
  readonly kind: Row<'messages'>['kind'];
  readonly body: string;
  readonly catchId: string | null;
  readonly replyTo: string | null;
  readonly at: number;
  /** Still in the outbox. */
  readonly sending: boolean;
  /** The server turned it down. */
  readonly refused: OutboxItem | null;
  /** On a top-level post: its replies, oldest first. */
  readonly replies: readonly ChatPost[];
}

function pendingPosts(
  items: readonly OutboxItem[],
  handles: ReadonlyMap<string, string>,
): { posts: ChatPost[]; deleting: Set<string> } {
  const posts: ChatPost[] = [];
  const deleting = new Set<string>();
  for (const item of items) {
    for (const step of item.steps) {
      if (step.kind !== 'call') continue;
      const a = step.args;
      if (step.fn === 'delete_message' && typeof a['p_id'] === 'string' && item.failure === null) {
        deleting.add(a['p_id']);
      }
      if (step.fn !== 'post_message' || typeof a['p_id'] !== 'string') continue;
      const anglerId = typeof a['p_angler_id'] === 'string' ? a['p_angler_id'] : null;
      const catchId = typeof a['p_catch_id'] === 'string' ? a['p_catch_id'] : null;
      posts.push({
        id: a['p_id'],
        anglerId,
        handle: (anglerId ? handles.get(anglerId) : undefined) ?? 'You',
        kind: catchId ? 'catch' : 'chat',
        body: typeof a['p_body'] === 'string' ? a['p_body'] : '',
        catchId,
        replyTo: typeof a['p_reply_to'] === 'string' ? a['p_reply_to'] : null,
        at: item.createdAt,
        sending: true,
        refused: item.failure === null ? null : item,
        replies: [],
      });
    }
  }
  return { posts, deleting };
}

/**
 * Newest conversation first; replies under their post, oldest first. A post
 * the server already has is shown from the server's copy.
 */
export function chatFeed(
  messages: Iterable<Row<'messages'>>,
  items: readonly OutboxItem[],
  anglers: Iterable<Row<'anglers'>>,
  eventId: string,
): ChatPost[] {
  const handles = new Map([...anglers].map((a) => [a.id, a.handle]));
  const { posts: pending, deleting } = pendingPosts(items, handles);
  const all = new Map<string, Omit<ChatPost, 'replies'>>();
  for (const m of messages) {
    if (m.event_id !== eventId) continue;
    all.set(m.id, {
      id: m.id,
      anglerId: m.angler_id,
      handle: m.handle,
      kind: m.kind,
      body: m.body,
      catchId: m.catch_id,
      replyTo: m.reply_to,
      at: Date.parse(m.created_at),
      sending: false,
      refused: null,
    });
  }
  for (const p of pending) if (!all.has(p.id)) all.set(p.id, p);
  // A post on its way out takes its replies with it, as the server will.
  for (const [id, p] of all) {
    if (deleting.has(id) || (p.replyTo !== null && deleting.has(p.replyTo))) all.delete(id);
  }

  const replies = new Map<string, Omit<ChatPost, 'replies'>[]>();
  const top: Omit<ChatPost, 'replies'>[] = [];
  for (const p of all.values()) {
    if (p.replyTo && all.has(p.replyTo)) {
      const list = replies.get(p.replyTo) ?? [];
      list.push(p);
      replies.set(p.replyTo, list);
    } else {
      top.push(p);
    }
  }
  return top
    .sort((a, b) => b.at - a.at)
    .map((p) => ({
      ...p,
      replies: (replies.get(p.id) ?? [])
        .sort((a, b) => a.at - b.at)
        .map((r) => ({ ...r, replies: [] })),
    }));
}

export function useChatFeed(): ChatPost[] {
  const event = useSync((s) => s.event);
  const messages = useSync((s) => s.tables.messages);
  const items = useSync((s) => s.outbox.items);
  const anglers = useSync((s) => s.tables.anglers);
  return useMemo(
    () => (event ? chatFeed(messages.values(), items, anglers.values(), event.id) : []),
    [event, messages, items, anglers],
  );
}

/** "just now", "12m ago", "10:42 AM" today, "Sep 18" before: the old app's wording. */
export function chatWhen(at: number, now: number, timeZone: string): string {
  const mins = Math.floor((now - at) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${String(mins)}m ago`;
  if (mins < 24 * 60) {
    return new Date(at).toLocaleTimeString('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return new Date(at).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' });
}

// ---- unread ---------------------------------------------------------------------
// When this phone last looked at the chat, per event. Kept in the browser:
// it is this phone's own business, and losing it only means a stale badge.

const seenListeners = new Set<() => void>();
const SEEN_PREFIX = 'livewire.chatSeen:';

function readSeen(eventId: string): number {
  try {
    const n = Number(localStorage.getItem(SEEN_PREFIX + eventId));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** The chat has been read up to this post. */
export function markChatSeen(eventId: string, at: number): void {
  if (at <= readSeen(eventId)) return;
  try {
    localStorage.setItem(SEEN_PREFIX + eventId, String(at));
  } catch {
    // Private browsing: the badge just will not remember.
  }
  seenListeners.forEach((l) => {
    l();
  });
}

function subscribeSeen(listener: () => void): () => void {
  seenListeners.add(listener);
  return () => seenListeners.delete(listener);
}

/** Posts newer than this phone's last look, not counting its own. */
export function unreadCount(
  messages: Iterable<Row<'messages'>>,
  eventId: string,
  since: number,
  mine: ReadonlySet<string>,
): number {
  let n = 0;
  for (const m of messages) {
    if (m.event_id !== eventId || (m.angler_id && mine.has(m.angler_id))) continue;
    if (Date.parse(m.created_at) > since) n += 1;
  }
  return n;
}

export function useChatUnread(): number {
  const event = useSync((s) => s.event);
  const messages = useSync((s) => s.tables.messages);
  const entry = useMyEntry();
  const since = useSyncExternalStore(subscribeSeen, () => (event ? readSeen(event.id) : 0));
  return useMemo(() => {
    if (!event) return 0;
    const mine = new Set(entry?.anglers.map((a) => a.angler.id) ?? []);
    return unreadCount(messages.values(), event.id, since, mine);
  }, [event, messages, entry, since]);
}
