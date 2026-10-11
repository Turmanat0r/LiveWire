import { describe, expect, it } from 'vitest';
import { lazyRemote } from './lazyRemote';
import type { LiveStatus } from './remote';
import { FakeServer, settle } from '../test/fakes';

describe('the server client, loaded on first use', () => {
  it('is not loaded until something needs it, and then once', async () => {
    const server = new FakeServer();
    let loads = 0;
    const remote = lazyRemote(() => {
      loads += 1;
      return Promise.resolve(server);
    });
    expect(loads).toBe(0);
    await remote.signIn();
    await remote.readTable('events', null);
    expect(loads).toBe(1);
  });

  it('tries the download again after one fails', async () => {
    const server = new FakeServer();
    let loads = 0;
    const remote = lazyRemote(() => {
      loads += 1;
      return loads === 1 ? Promise.reject(new Error('no signal')) : Promise.resolve(server);
    });
    await expect(remote.signIn()).rejects.toThrow('no signal');
    expect(await remote.signIn()).toBe('device-1');
  });

  it('does not start listening if stopped while still loading', async () => {
    const server = new FakeServer();
    const remote = lazyRemote(() => Promise.resolve(server));
    const statuses: LiveStatus[] = [];
    const stop = remote.listen(
      ['events'],
      () => undefined,
      (s) => statuses.push(s),
    );
    stop();
    await settle();
    expect(server.listening()).toEqual([]);
    expect(statuses).toEqual([]);
  });
});
