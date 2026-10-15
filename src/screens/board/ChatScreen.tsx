import { useEffect, useId, useRef, useState } from 'react';
import { screen } from '../../app/screens';
import { useNow } from '../../app/useNow';
import { CHAT_MAX, chatWhen, markChatSeen, useChatFeed, type ChatPost } from '../../data/chat';
import { useMyEntry } from '../../data/myEntry';
import { useSync, useSyncEngine } from '../../data/useSync';
import { Page } from '../../ui/Page';
import { StatusBadge } from '../catches/CatchCard';
import { inchesText } from './StandingsScreen';
import '../../ui/forms.css';
import './chat.css';

/**
 * The boat-ramp group chat. Every catch announces itself here; anyone can
 * read along, and a registered phone can post, reply and delete its own.
 * Posts go through the outbox, so one written with no signal waits and sends.
 */
export function ChatScreen() {
  const sync = useSyncEngine();
  const event = useSync((s) => s.event);
  const messages = useSync((s) => s.tables.messages);
  const mine = useMyEntry();
  const feed = useChatFeed();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatPost | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const boxId = useId();
  const me = mine?.me.angler ?? null;
  const left = CHAT_MAX - text.length;

  // Seen up to the newest post the server has: the Chat tab's count clears.
  useEffect(() => {
    if (!event) return;
    let newest = 0;
    for (const m of messages.values()) {
      if (m.event_id === event.id) newest = Math.max(newest, Date.parse(m.created_at));
    }
    if (newest > 0) markChatSeen(event.id, newest);
  }, [event, messages]);

  function post() {
    const body = text.trim();
    if (!body || !me) return;
    if (body.length > CHAT_MAX) {
      setProblem(`That is longer than ${String(CHAT_MAX)} characters.`);
      return;
    }
    setProblem(null);
    const id = crypto.randomUUID();
    void sync.queue({
      id,
      label: replyTo ? 'Reply' : 'Chat message',
      createdAt: Date.now(),
      steps: [
        {
          kind: 'call',
          fn: 'post_message',
          args: {
            p_id: id,
            p_angler_id: me.id,
            p_body: body,
            p_reply_to: replyTo?.id ?? null,
          },
        },
      ],
    });
    setText('');
    setReplyTo(null);
  }

  return (
    <Page title={screen('chat').title}>
      <p className="hint">
        {me
          ? `You post as ${me.handle}. Catches you submit show up here automatically, so the field knows.`
          : 'Register on this device to join in. You can read along either way.'}
      </p>
      {me ? (
        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            post();
          }}
        >
          {replyTo ? (
            <p className="chat-compose__replying">
              Replying to {replyTo.handle}{' '}
              <button
                className="button button--small"
                type="button"
                onClick={() => {
                  setReplyTo(null);
                }}
              >
                Cancel
              </button>
            </p>
          ) : null}
          <div className="chat-compose__row">
            <div className="field chat-compose__box">
              <label className="visually-hidden" htmlFor={boxId}>
                {replyTo ? 'Your reply' : 'Message'}
              </label>
              <textarea
                ref={box}
                id={boxId}
                rows={2}
                maxLength={CHAT_MAX}
                placeholder={replyTo ? 'Your reply…' : 'Say something to the field…'}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                }}
              />
            </div>
            <button className="button chat-compose__send" type="submit" disabled={!text.trim()}>
              {replyTo ? 'Reply' : 'Post'}
            </button>
          </div>
          {left <= 40 ? <p className="chat-compose__count">{left} left</p> : null}
          {problem ? (
            <p className="err" role="alert">
              {problem}
            </p>
          ) : null}
        </form>
      ) : null}
      {feed.length === 0 ? (
        <p className="empty">Nothing said yet. Land a fish and it will announce itself.</p>
      ) : (
        <ul className="chat-feed" aria-label="Messages">
          {feed.map((p) => (
            <ChatItem
              key={p.id}
              post={p}
              meId={me?.id ?? null}
              timeZone={event?.time_zone ?? 'America/Denver'}
              onReply={() => {
                setReplyTo(p);
                box.current?.focus();
              }}
            />
          ))}
        </ul>
      )}
    </Page>
  );
}

function ChatItem({
  post,
  meId,
  timeZone,
  onReply,
}: {
  readonly post: ChatPost;
  readonly meId: string | null;
  readonly timeZone: string;
  readonly onReply: (() => void) | null;
}) {
  const sync = useSyncEngine();
  const now = useNow();
  // One author per message: on a team, each half deletes only their own.
  const mine = meId !== null && post.anglerId === meId;
  return (
    <li className={`${onReply ? 'chat-item' : 'chat-reply'}${mine ? ' chat-item--mine' : ''}`}>
      <p className="chat-item__top">
        <span className="chat-item__handle">{post.handle}</span>
        <span className="chat-item__when">
          {post.sending ? 'Sending…' : chatWhen(post.at, now, timeZone)}
        </span>
      </p>
      {post.body ? <p className="chat-item__text">{post.body}</p> : null}
      {post.kind === 'catch' && post.catchId ? <Brag catchId={post.catchId} /> : null}
      {post.refused ? (
        <div className="notice notice--problem" role="alert">
          <strong>Not posted</strong>
          {post.refused.failure?.detail}{' '}
          <button
            className="button button--small"
            type="button"
            onClick={() => {
              if (post.refused) void sync.outbox.discard(post.refused);
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {(onReply || mine) && !post.sending ? (
        <div className="actions chat-item__actions">
          {onReply && meId ? (
            <button className="button button--small" type="button" onClick={onReply}>
              Reply
            </button>
          ) : null}
          {mine ? (
            <button
              className="button button--small button--danger"
              type="button"
              onClick={() => {
                const sure = window.confirm(
                  post.replies.length > 0
                    ? 'Delete this message? Its replies go too.'
                    : 'Delete this message?',
                );
                if (!sure) return;
                void sync.queue({
                  id: crypto.randomUUID(),
                  label: 'Delete message',
                  createdAt: Date.now(),
                  steps: [{ kind: 'call', fn: 'delete_message', args: { p_id: post.id } }],
                });
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
      ) : null}
      {post.replies.length > 0 ? (
        <ul className="chat-replies" aria-label={`Replies to ${post.handle}`}>
          {post.replies.map((r) => (
            <ChatItem key={r.id} post={r} meId={meId} timeZone={timeZone} onReply={null} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * A catch's announcement, read from the catch itself rather than copied when
 * it was posted: a fish later rejected does not go on boasting.
 */
function Brag({ catchId }: { readonly catchId: string }) {
  const catches = useSync((s) => s.tables.catches);
  const items = useSync((s) => s.outbox.items);
  const found = [...catches.values()].find((c) => c.id === catchId);
  if (found) {
    return (
      <p className="chat-brag">
        <strong>{inchesText(found.length_inches)}</strong> {found.species} ·{' '}
        {found.division === 'team' ? 'Team' : 'Solo'} <StatusBadge status={found.status} />
      </p>
    );
  }
  // Still on this phone: say what it is from the filing waiting to send.
  for (const item of items) {
    for (const step of item.steps) {
      if (step.kind !== 'call' || step.fn !== 'file_catch' || step.args['p_id'] !== catchId) {
        continue;
      }
      const inches = step.args['p_length_inches'];
      const species = step.args['p_species'];
      return (
        <p className="chat-brag">
          <strong>{typeof inches === 'number' ? inchesText(inches) : ''}</strong>{' '}
          {typeof species === 'string' ? species : ''} <StatusBadge status="waiting" />
        </p>
      );
    }
  }
  return <p className="chat-brag">That catch is no longer on the board.</p>;
}
