import { describe, expect, it, vi } from 'vitest';

import { SESSION_SCOPE } from '../../src/shared/constants';
import type { StorageDriver } from '../../src/shared/storage';
import { createMessageHandler } from './router';

function createMemoryStorage(): StorageDriver {
  const localStore: Record<string, unknown> = {};
  const syncStore: Record<string, unknown> = {};

  function makeArea(store: Record<string, unknown>): chrome.storage.StorageArea {
    return {
      get(keys: any, callback: any) {
        if (typeof keys === 'string') {
          callback({ [keys]: store[keys] });
          return;
        }
        if (Array.isArray(keys)) {
          callback(Object.fromEntries(keys.map((key) => [key, store[key]])));
          return;
        }
        callback({ ...store });
      },
      getBytesInUse(_keys: any, callback: any) {
        callback(0);
      },
      set(items: any, callback: any) {
        Object.assign(store, items);
        callback?.();
      },
      remove(keys: any, callback: any) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          delete store[key];
        }
        callback?.();
      },
      clear(callback: any) {
        for (const key of Object.keys(store)) {
          delete store[key];
        }
        callback?.();
      },
    } as chrome.storage.StorageArea;
  }

  return {
    local: makeArea(localStore),
    sync: makeArea(syncStore),
  };
}

describe('background message handler', () => {
  it('starts and extends a global session', async () => {
    const badge = vi.fn().mockResolvedValue(undefined);
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge,
    });

    const started = await handler({ type: 'session:start', durationMinutes: 25 });
    if (!started.ok || !('session' in started)) {
      throw new Error('Expected session response.');
    }

    expect(started.session?.scope).toBe(SESSION_SCOPE);

    const extended = await handler({ type: 'session:extend', durationMinutes: 15 });
    if (!extended.ok || !('session' in extended)) {
      throw new Error('Expected session response.');
    }

    expect(extended.session?.durationMinutes).toBe(40);
  });

  it('pauses and resumes a session without clearing it', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    const started = await handler({ type: 'session:start', durationMinutes: 25 });
    if (!started.ok || !('session' in started) || !started.session) {
      throw new Error('Expected started session response.');
    }

    const paused = await handler({ type: 'session:pause' });
    if (!paused.ok || !('session' in paused) || !paused.session) {
      throw new Error('Expected paused session response.');
    }

    expect(paused.session.status).toBe('paused');
    expect(paused.session.remainingMs).toBeGreaterThan(0);

    const resumed = await handler({ type: 'session:resume' });
    if (!resumed.ok || !('session' in resumed) || !resumed.session) {
      throw new Error('Expected resumed session response.');
    }

    expect(resumed.session.status).toBe('active');
    expect(resumed.session.remainingMs).toBeUndefined();
  });

  it('adds notes and exports markdown', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    await handler({
      type: 'notes:add',
      videoId: 'abc123',
      title: 'Test video',
      url: 'https://www.youtube.com/watch?v=abc123',
      text: 'Review this section',
      timestampSec: 90,
    });

    const exported = await handler({ type: 'notes:export', videoId: 'abc123' });
    if (!exported.ok || !('markdown' in exported)) {
      throw new Error('Expected markdown export response.');
    }

    expect(exported.filename).toContain('abc123');
    expect(exported.markdown).toContain('Review this section');
  });

  it('tracks watch history for videos in a session', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    await handler({ type: 'session:start', durationMinutes: 25 });
    await handler({
      type: 'session:history:track',
      videoId: 'abc123',
      title: 'Tracked video',
      url: 'https://www.youtube.com/watch?v=abc123',
    });

    await handler({
      type: 'notes:add',
      videoId: 'abc123',
      title: 'Tracked video',
      url: 'https://www.youtube.com/watch?v=abc123',
      text: 'History note',
      timestampSec: 30,
    });

    const history = await handler({ type: 'session:history:get' });
    if (!history.ok || !('history' in history) || !history.history) {
      throw new Error('Expected session history response.');
    }

    expect(history.history.videos).toHaveLength(1);
    expect(history.history.videos[0].videoId).toBe('abc123');
    expect(history.history.videos[0].notes).toHaveLength(1);
  });

  it('clears session history on demand', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    await handler({ type: 'session:start', durationMinutes: 25 });
    await handler({
      type: 'session:history:track',
      videoId: 'abc123',
      title: 'Tracked video',
      url: 'https://www.youtube.com/watch?v=abc123',
    });

    const cleared = await handler({ type: 'session:history:clear' });
    if (!cleared.ok || !('history' in cleared)) {
      throw new Error('Expected history clear response.');
    }
    expect(cleared.history).toBeNull();

    const history = await handler({ type: 'session:history:get' });
    if (!history.ok || !('history' in history)) {
      throw new Error('Expected history response.');
    }
    expect(history.history).toBeNull();
  });
});
