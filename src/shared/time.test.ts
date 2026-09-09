import { describe, expect, it } from 'vitest';

import {
  clampDurationMinutes,
  formatCountdown,
  formatTimestampLabel,
  getRemainingMs,
  getSessionPhase,
  pauseActiveSession,
  resumePausedSession,
} from './time';
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
    const resumed = resumePausedSession({
      ...baseSession,
      status: 'paused',
      remainingMs: 180_000,
    }, 121_000);
    expect(resumed.status).toBe('active');
    expect(resumed.remainingMs).toBeUndefined();
    expect(resumed.endsAt).toBe(301_000);
  });

  it('detects expired sessions from status or endsAt', () => {
    expect(getSessionPhase(baseSession, 400_000)).toBe('expired');
    expect(getSessionPhase({ ...baseSession, status: 'expired' }, 100_000)).toBe('expired');
    expect(getSessionPhase(null)).toBe('idle');
  });

  it('formats countdowns and timestamps', () => {
    expect(formatCountdown(65_000)).toBe('01:05');
    expect(formatCountdown(3_661_000)).toBe('1:01:01');
    expect(formatTimestampLabel(95)).toBe('1:35');
    expect(formatTimestampLabel(3723)).toBe('1:02:03');
  });

  it('returns remaining ms for paused sessions', () => {
    expect(getRemainingMs({ ...baseSession, status: 'paused', remainingMs: 12_000 })).toBe(12_000);
  });

  it('clamps duration minutes into the supported range', () => {
    expect(clampDurationMinutes(25)).toBe(25);
    expect(clampDurationMinutes(1)).toBe(5);
    expect(clampDurationMinutes(999)).toBe(240);
    expect(() => clampDurationMinutes(0)).toThrow(/positive number/);
  });
});
