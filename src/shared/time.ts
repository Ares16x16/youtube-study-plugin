import type { ActiveSession } from './types';

export function getSessionPhase(
  session: ActiveSession | null,
  now = Date.now(),
): 'idle' | 'active' | 'paused' | 'expired' {
  if (!session) {
    return 'idle';
  }
  if (session.status === 'paused') {
    return 'paused';
  }
  if (session.status === 'expired' || session.endsAt <= now) {
    return 'expired';
  }
  return 'active';
}

export function getRemainingMs(session: ActiveSession | null, now = Date.now()): number {
  if (!session) {
    return 0;
  }
  if (session.status === 'paused') {
    return Math.max(0, session.remainingMs ?? 0);
  }
  return Math.max(0, session.endsAt - now);
}

export function getRemainingMinutes(session: ActiveSession | null, now = Date.now()): number {
  return Math.ceil(getRemainingMs(session, now) / 60_000);
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatTimestampLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function createEndsAt(durationMinutes: number, now = Date.now()): number {
  return now + Math.round(durationMinutes) * 60_000;
}

export function pauseActiveSession(session: ActiveSession, now = Date.now()): ActiveSession {
  return {
    ...session,
    status: 'paused',
    remainingMs: getRemainingMs(session, now),
  };
}

export function resumePausedSession(session: ActiveSession, now = Date.now()): ActiveSession {
  const remainingMs = Math.max(0, session.remainingMs ?? 0);
  return {
    ...session,
    status: 'active',
    endsAt: now + remainingMs,
    remainingMs: undefined,
  };
}
