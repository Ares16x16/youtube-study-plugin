import { describe, expect, it, vi } from 'vitest';

import { SESSION_SCOPE } from '../../src/shared/constants';
import type { StorageDriver } from '../../src/shared/storage';
import { createMessageHandler, reconcileSessionState } from './router';

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

  it('clamps tiny and huge durations', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    const tiny = await handler({ type: 'session:start', durationMinutes: 1 });
    if (!tiny.ok || !('session' in tiny) || !tiny.session) {
      throw new Error('Expected clamped session.');
    }
    expect(tiny.session.durationMinutes).toBe(5);

    const huge = await handler({ type: 'session:start', durationMinutes: 999 });
    if (!huge.ok || !('session' in huge) || !huge.session) {
      throw new Error('Expected clamped session.');
    }
    expect(huge.session.durationMinutes).toBe(240);
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

  it('rejects empty notes and exports markdown', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    const rejected = await handler({
      type: 'notes:add',
      videoId: 'abc123',
      title: 'Test video',
      url: 'https://www.youtube.com/watch?v=abc123',
      text: '   ',
      timestampSec: 90,
    });
    expect(rejected.ok).toBe(false);

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
  });

  it('marks sessions expired and reopens history on extend', async () => {
    const storage = createMemoryStorage();
    const handler = createMessageHandler({
      storage,
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });

    const started = await handler({ type: 'session:start', durationMinutes: 5 });
    if (!started.ok || !('session' in started) || !started.session) {
      throw new Error('Expected start.');
    }

    await new Promise<void>((resolve) => {
      storage.local.set({
        activeSession: {
          ...started.session,
          endsAt: Date.now() - 1_000,
        },
      }, () => resolve());
    });

    const expired = await reconcileSessionState(storage);
    expect(expired?.status).toBe('expired');

    const historyBefore = await handler({ type: 'session:history:get' });
    if (!historyBefore.ok || !('history' in historyBefore) || !historyBefore.history) {
      throw new Error('Expected history.');
    }
    expect(historyBefore.history.endedAt).not.toBeNull();

    const extended = await handler({ type: 'session:extend', durationMinutes: 15 });
    if (!extended.ok || !('session' in extended) || !extended.session) {
      throw new Error('Expected extend.');
    }
    expect(extended.session.status).toBe('active');

    const historyAfter = await handler({ type: 'session:history:get' });
    if (!historyAfter.ok || !('history' in historyAfter) || !historyAfter.history) {
      throw new Error('Expected history.');
    }
    expect(historyAfter.history.endedAt).toBeNull();
  });

  it('rejects non-YouTube transcript URLs', async () => {
    const handler = createMessageHandler({
      storage: createMemoryStorage(),
      fetchFn: vi.fn(),
      badge: vi.fn().mockResolvedValue(undefined),
    });
    const response = await handler({
      type: 'transcript:get',
      trackUrl: 'https://evil.example/captions.xml',
    });
    expect(response.ok).toBe(false);
  });
});
