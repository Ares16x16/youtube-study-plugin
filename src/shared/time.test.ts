import { describe, expect, it } from 'vitest';

import { pauseActiveSession, resumePausedSession } from './time';
import type { ActiveSession } from './types';

describe('session time helpers', () => {
  const baseSession: ActiveSession = {
    id: 'session-1',
    status: 'active',
    startedAt: 1_000,
    endsAt: 301_000,
    durationMinutes: 5,
    scope: 'youtube-global',
  };

  it('pauses an active session and stores remaining time', () => {
    const paused = pauseActiveSession(baseSession, 121_000);

    expect(paused.status).toBe('paused');
    expect(paused.remainingMs).toBe(180_000);
  });

  it('resumes a paused session with a new endsAt', () => {
    const resumed = resumePausedSession(
      {
        ...baseSession,
        status: 'paused',
        remainingMs: 180_000,
      },
      121_000,
    );

    expect(resumed.status).toBe('active');
    expect(resumed.remainingMs).toBeUndefined();
    expect(resumed.endsAt).toBe(301_000);
  });
});
