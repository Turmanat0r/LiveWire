import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '../../data/tables';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, entryRows, EVENT_ID, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function field() {
  const server = new FakeServer();
  server.put('events', eventRow());
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Walleye',
    record_inches: 36,
    position: 0,
  });
  const me = entryRows({ number: 1, userId: 'device-1', names: ['Me Myself'] });
  const rival = entryRows({ number: 2, userId: 'device-2', names: ['Rival Angler'] });
  putEntry(server, me);
  putEntry(server, rival);
  // Handles are unique in an event; the test rows all start with the same one.
  const [rivalAngler] = rival.anglers;
  if (rivalAngler) server.put('anglers', { ...rivalAngler, handle: 'Rusty Shoal Pike' });
  const handle = (rows: typeof me) => rows.anglers[0]?.handle ?? '';
  return { server, me, rival, myHandle: handle(me), rivalHandle: 'Rusty Shoal Pike' };
}

async function open(server: FakeServer, path: string) {
  const sync = testSync(server);
  renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

const steps = (sync: ReturnType<typeof testSync>) =>
  sync.getState().outbox.items.flatMap((i) => i.steps);

const betRow = (over: Partial<Row<'bets'>>): Row<'bets'> => ({
  id: 'bet-1',
  event_id: EVENT_ID,
  creator_angler_id: 'x',
  title: 'Smallest walleye',
  stake: 'A beer',
  scoring: 'smallest',
  winner_angler_id: null,
  settled_at: null,
  created_at: '2027-09-18T15:00:00+00:00',
  ...over,
});

describe('side bets', () => {
  it('starts a bet with its starter in it, and shows it at once', async () => {
    const { server, me } = field();
    const { sync, user } = await open(server, '/side-bets');
    server.online = false;
    await user.type(screen.getByLabelText('What is the bet?'), 'First fish of the day');
    await user.selectOptions(screen.getByLabelText('Who wins?'), 'first');
    await user.type(screen.getByLabelText('Stake (optional)'), 'Coffee');
    await user.click(screen.getByRole('button', { name: 'Start it' }));
    await act(settle);
    expect(steps(sync)).toMatchObject([
      {
        fn: 'create_bet',
        args: { p_title: 'First fish of the day', p_scoring: 'first', p_stake: 'Coffee' },
      },
      { fn: 'join_bet', args: { p_angler_id: me.captainId } },
    ]);
    const bet = within(screen.getByRole('list', { name: 'Side bets' })).getByRole('listitem');
    expect(bet.textContent).toContain('First fish of the dayIn');
    expect(bet.textContent).toContain('First approved fish · 1 angler in');
    expect(bet.textContent).toContain('Waiting to send.');
  });

  it('names the leader from approved fish, and lets the starter call it', async () => {
    const { server, me, rival, rivalHandle } = field();
    server.put('bets', betRow({ creator_angler_id: me.captainId }));
    for (const a of [me.captainId, rival.captainId]) {
      server.put('bet_entries', {
        bet_id: 'bet-1',
        angler_id: a,
        event_id: EVENT_ID,
        joined_at: '2027-09-18T15:00:00+00:00',
      });
    }
    server.put('catches', catchRow({ angler_id: me.captainId, length_inches: 19 }));
    server.put('catches', catchRow({ angler_id: rival.captainId, length_inches: 16.5 }));
    const { sync, user } = await open(server, '/side-bets');
    expect(screen.getByText(/Leading:/).textContent).toBe(`Leading: ${rivalHandle} · 16.50″`);
    server.online = false;
    await user.click(screen.getByRole('button', { name: 'Call the winner' }));
    // The app's own call is ticked to start with.
    expect(screen.getByRole('radio', { name: rivalHandle })).toHaveProperty('checked', true);
    await user.click(screen.getByRole('button', { name: 'Call it' }));
    await act(settle);
    expect(steps(sync)).toMatchObject([
      { fn: 'settle_bet', args: { p_bet_id: 'bet-1', p_winner_angler_id: rival.captainId } },
    ]);
    expect(screen.getByText(/Won by/).textContent).toBe(`Won by ${rivalHandle}`);
  });

  it('lets anyone registered join, and only the starter call or delete', async () => {
    const { server, me, rival } = field();
    server.put('bets', betRow({ creator_angler_id: rival.captainId }));
    server.put('bet_entries', {
      bet_id: 'bet-1',
      angler_id: rival.captainId,
      event_id: EVENT_ID,
      joined_at: '2027-09-18T15:00:00+00:00',
    });
    const { sync, user } = await open(server, '/side-bets');
    expect(screen.queryByRole('button', { name: 'Call the winner' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    server.online = false;
    await user.click(screen.getByRole('button', { name: 'I’m in' }));
    await act(settle);
    expect(steps(sync)).toMatchObject([
      { fn: 'join_bet', args: { p_bet_id: 'bet-1', p_angler_id: me.captainId } },
    ]);
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
  });

  it('shows the Big Fish pot above the bets', async () => {
    const { server } = field();
    await open(server, '/side-bets');
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings.indexOf('Big Fish pot')).toBeLessThan(headings.indexOf('Side bets'));
  });
});

const messageRow = (over: Partial<Row<'messages'>>): Row<'messages'> => ({
  id: 'm1',
  event_id: EVENT_ID,
  angler_id: null,
  handle: 'Someone',
  kind: 'chat',
  body: 'Hello',
  catch_id: null,
  reply_to: null,
  created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  ...over,
});

describe('chat', () => {
  it('posts through the outbox, and shows the post at once', async () => {
    const { server, me, myHandle } = field();
    const { sync, user } = await open(server, '/chat');
    server.online = false;
    await user.type(screen.getByLabelText('Message'), 'Fish on at the silos');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await act(settle);
    expect(steps(sync)).toMatchObject([
      {
        fn: 'post_message',
        args: { p_angler_id: me.captainId, p_body: 'Fish on at the silos', p_reply_to: null },
      },
    ]);
    const [post] = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
    expect(post?.textContent).toContain(`${myHandle}Sending…Fish on at the silos`);
  });

  it('replies under the post, and lets an angler delete only their own', async () => {
    const { server, me, rival, rivalHandle } = field();
    server.put(
      'messages',
      messageRow({ id: 'theirs', angler_id: rival.captainId, handle: rivalHandle }),
    );
    server.put('messages', messageRow({ id: 'mine', angler_id: me.captainId, body: 'Mine' }));
    const { sync, user } = await open(server, '/chat');
    const feed = screen.getByRole('list', { name: 'Messages' });
    expect(within(feed).getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    server.online = false;
    const theirs = within(feed)
      .getAllByRole('listitem')
      .find((li) => li.textContent.includes('Hello'));
    if (!theirs) throw new Error('their post is shown');
    await user.click(within(theirs).getByRole('button', { name: 'Reply' }));
    expect(screen.getByText(`Replying to ${rivalHandle}`)).toBeTruthy();
    await user.type(screen.getByLabelText('Your reply'), 'Nice fish');
    const compose = screen.getByLabelText('Your reply').closest('form');
    if (!compose) throw new Error('the reply box is in a form');
    await user.click(within(compose).getByRole('button', { name: 'Reply' }));
    await act(settle);
    expect(steps(sync)).toMatchObject([
      { fn: 'post_message', args: { p_body: 'Nice fish', p_reply_to: 'theirs' } },
    ]);
    expect(
      within(screen.getByRole('list', { name: `Replies to ${rivalHandle}` })).getByText(
        'Nice fish',
      ),
    ).toBeTruthy();
  });

  it('announces a catch from the catch itself', async () => {
    const { server, rival, rivalHandle } = field();
    server.put(
      'catches',
      catchRow({ id: 'c1', angler_id: rival.captainId, length_inches: 22.5, status: 'pending' }),
    );
    server.put(
      'messages',
      messageRow({
        angler_id: rival.captainId,
        handle: rivalHandle,
        kind: 'catch',
        body: '',
        catch_id: 'c1',
      }),
    );
    await open(server, '/chat');
    expect(screen.getByText(/Walleye/).closest('p')?.textContent).toBe(
      '22.50″ Walleye · Solo Pending review',
    );
  });

  it('counts new posts on the Chat tab until the chat is opened', async () => {
    const { server, rival, rivalHandle } = field();
    server.put(
      'messages',
      messageRow({ id: 'a', angler_id: rival.captainId, handle: rivalHandle }),
    );
    server.put(
      'messages',
      messageRow({ id: 'b', angler_id: rival.captainId, handle: rivalHandle }),
    );
    const { user } = await open(server, '/standings');
    expect(screen.getByRole('link', { name: 'Chat, 2 unread' })).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Chat, 2 unread' }));
    expect(screen.getByRole('link', { name: 'Chat' })).toBeTruthy();
  });
});
