import { DEFAULT_EXTEND_MINUTES, SESSION_ALARM_NAME, SESSION_SCOPE } from '../../src/shared/constants';
import { clearAlarm, createAlarm, setBadgeBackgroundColor, setBadgeText } from '../../src/shared/chrome';
import { buildNotesMarkdown } from '../../src/shared/markdown';
import { parseCaptionXml } from '../../src/shared/transcript';
import {
  clearSessionHistory,
  clearSession,
  getSession,
  getSessionHistory,
  getSettings,
  getVideoNote,
  putVideoNote,
  setSessionHistory,
  setSession,
  updateSettings,
  type StorageDriver,
} from '../../src/shared/storage';
import { createEndsAt, getRemainingMinutes, getSessionPhase, pauseActiveSession, resumePausedSession } from '../../src/shared/time';
import type {
  ActiveSession,
  ErrorResponse,
  NoteExportResponse,
  RuntimeMessage,
  RuntimeResponse,
  StudySessionHistory,
  TranscriptResponse,
  VideoNote,
} from '../../src/shared/types';

interface BackgroundDependencies {
  storage?: StorageDriver;
  fetchFn?: typeof fetch;
  badge?: typeof syncBadge;
}

export async function syncBadge(session: ActiveSession | null): Promise<void> {
  const phase = getSessionPhase(session);
  if (phase === 'idle') {
    await Promise.all([setBadgeText(''), setBadgeBackgroundColor('#0f172a')]);
    return;
  }
  if (phase === 'paused') {
    await Promise.all([setBadgeText('||'), setBadgeBackgroundColor('#b45309')]);
    return;
  }
  if (phase === 'expired') {
    await Promise.all([setBadgeText('!'), setBadgeBackgroundColor('#b91c1c')]);
    return;
  }
  const minutes = Math.max(1, getRemainingMinutes(session));
  await Promise.all([setBadgeText(`${Math.min(minutes, 99)}m`), setBadgeBackgroundColor('#0f766e')]);
}

async function scheduleSessionAlarm(): Promise<void> {
  await createAlarm(SESSION_ALARM_NAME, {
    when: Date.now() + 1_000,
    periodInMinutes: 0.1,
  });
}

async function cancelSessionAlarm(): Promise<void> {
  await clearAlarm(SESSION_ALARM_NAME);
}

export function toErrorResponse(error: unknown): ErrorResponse {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}

export async function reconcileSessionState(storage?: StorageDriver): Promise<ActiveSession | null> {
  const session = await getSession(storage);
  if (!session) {
    await cancelSessionAlarm();
    await syncBadge(null);
    return null;
  }

  if (session.status === 'paused') {
    await cancelSessionAlarm();
    await syncBadge(session);
    return session;
  }

  if (session.endsAt <= Date.now() && session.status !== 'expired') {
    const expiredSession: ActiveSession = {
      ...session,
      status: 'expired',
    };
    await setSession(expiredSession, storage);
    await finalizeSessionHistory(session.id, storage);
    await cancelSessionAlarm();
    await syncBadge(expiredSession);
    return expiredSession;
  }

  await syncBadge(session);
  return session;
}

function sanitizeDuration(durationMinutes: number): number {
  const rounded = Math.round(durationMinutes);
  if (!Number.isFinite(rounded) || rounded <= 0) {
    throw new Error('Duration must be a positive number of minutes.');
  }
  return rounded;
}

async function handleSessionStart(durationMinutes: number, storage?: StorageDriver) {
  const safeDuration = sanitizeDuration(durationMinutes);
  const startedAt = Date.now();
  const next: ActiveSession = {
    id: createSessionId(),
    status: 'active',
    startedAt,
    endsAt: createEndsAt(safeDuration, startedAt),
    durationMinutes: safeDuration,
    remainingMs: undefined,
    scope: SESSION_SCOPE,
  };
  await clearSessionHistory(storage);
  await setSession(next, storage);
  await setSessionHistory(createSessionHistory(next), storage);
  await scheduleSessionAlarm();
  await syncBadge(next);
  return { ok: true, session: next } as const;
}

async function handleSessionEnd(storage?: StorageDriver) {
  const current = await getSession(storage);
  if (current) {
    await finalizeSessionHistory(current.id, storage);
  }
  await clearSession(storage);
  await cancelSessionAlarm();
  await syncBadge(null);
  return { ok: true, session: null } as const;
}

async function handleSessionPause(storage?: StorageDriver) {
  const current = await getSession(storage);
  if (!current || current.status !== 'active') {
    return { ok: true, session: current } as const;
  }
  const next = pauseActiveSession(current);
  await setSession(next, storage);
  await cancelSessionAlarm();
  await syncBadge(next);
  return { ok: true, session: next } as const;
}

async function handleSessionResume(storage?: StorageDriver) {
  const current = await getSession(storage);
  if (!current || current.status !== 'paused') {
    return { ok: true, session: current } as const;
  }
  const next = resumePausedSession(current);
  await setSession(next, storage);
  await scheduleSessionAlarm();
  await syncBadge(next);
  return { ok: true, session: next } as const;
}

async function handleSessionExtend(durationMinutes: number, storage?: StorageDriver) {
  const current = await getSession(storage);
  if (!current) {
    return { ok: true, session: null } as const;
  }
  const safeDuration = sanitizeDuration(durationMinutes || DEFAULT_EXTEND_MINUTES);
  if (current.status === 'paused') {
    const remainingMs = Math.max(0, current.remainingMs ?? 0) + safeDuration * 60_000;
    const next: ActiveSession = {
      ...current,
      durationMinutes: current.durationMinutes + safeDuration,
      remainingMs,
      endsAt: Date.now() + remainingMs,
    };
    await setSession(next, storage);
    await cancelSessionAlarm();
    await syncBadge(next);
    return { ok: true, session: next } as const;
  }
  const base = current.status === 'expired' ? Date.now() : Math.max(Date.now(), current.endsAt);
  const next: ActiveSession = {
    ...current,
    status: 'active',
    endsAt: base + safeDuration * 60_000,
    durationMinutes: current.durationMinutes + safeDuration,
    remainingMs: undefined,
  };
  await setSession(next, storage);
  await scheduleSessionAlarm();
  await syncBadge(next);
  return { ok: true, session: next } as const;
}

async function handleNotesAdd(message: Extract<RuntimeMessage, { type: 'notes:add' }>, storage?: StorageDriver) {
  const current = await getVideoNote(message.videoId, storage);
  const next: VideoNote = {
    videoId: message.videoId,
    title: message.title,
    url: message.url,
    updatedAt: Date.now(),
    items: [
      ...(current?.items ?? []),
      {
        id: crypto.randomUUID(),
        timestampSec: Math.max(0, Math.floor(message.timestampSec)),
        text: message.text.trim(),
        createdAt: Date.now(),
      },
    ],
  };
  await putVideoNote(next, storage);
  await syncHistoryNotes(next, storage);
  return { ok: true, note: next } as const;
}

async function handleSessionHistoryTrack(
  message: Extract<RuntimeMessage, { type: 'session:history:track' }>,
  storage?: StorageDriver,
) {
  const session = await getSession(storage);
  if (!session) {
    return { ok: true, history: null } as const;
  }

  const history = await ensureSessionHistory(session, storage);
  const note = await getVideoNote(message.videoId, storage);
  const now = Date.now();
  const existingIndex = history.videos.findIndex((entry) => entry.videoId === message.videoId);

  if (existingIndex === -1) {
    history.videos.push({
      videoId: message.videoId,
      title: message.title,
      url: message.url,
      firstSeenAt: now,
      lastSeenAt: now,
      notes: note?.items ?? [],
    });
  } else {
    history.videos[existingIndex] = {
      ...history.videos[existingIndex],
      title: message.title,
      url: message.url,
      lastSeenAt: now,
      notes: note?.items ?? history.videos[existingIndex].notes,
    };
  }

  history.videos.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  await setSessionHistory(history, storage);
  return { ok: true, history } as const;
}

async function handleNotesExport(videoId: string, storage?: StorageDriver): Promise<NoteExportResponse | ErrorResponse> {
  const note = await getVideoNote(videoId, storage);
  if (!note) {
    return { ok: false, error: 'No notes found for this video.' };
  }
  return {
    ok: true,
    filename: `${slugify(note.title)}-${note.videoId}.md`,
    markdown: buildNotesMarkdown(note),
  };
}

async function handleTranscriptGet(trackUrl: string, fetchFn: typeof fetch): Promise<TranscriptResponse | ErrorResponse> {
  const response = await fetchFn(trackUrl, {
    credentials: 'include',
    headers: {
      Accept: 'application/xml,text/xml',
    },
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `Transcript fetch failed with status ${response.status}.`,
    };
  }
  const xml = await response.text();
  return { ok: true, cues: parseCaptionXml(xml) };
}

export function createMessageHandler(deps: BackgroundDependencies = {}) {
  const storage = deps.storage;
  const fetchFn = deps.fetchFn ?? fetch;
  const badge = deps.badge ?? syncBadge;

  return async (message: RuntimeMessage): Promise<RuntimeResponse> => {
    switch (message.type) {
      case 'session:get':
        return { ok: true, session: await reconcileSessionState(storage) };
      case 'session:history:get':
        return { ok: true, history: await getSessionHistory(storage) };
      case 'session:history:clear':
        await clearSessionHistory(storage);
        return { ok: true, history: null };
      case 'session:history:track':
        return handleSessionHistoryTrack(message, storage);
      case 'session:start':
        return handleSessionStart(message.durationMinutes, storage);
      case 'session:end':
        return handleSessionEnd(storage);
      case 'session:pause':
        return handleSessionPause(storage);
      case 'session:resume':
        return handleSessionResume(storage);
      case 'session:extend':
        return handleSessionExtend(message.durationMinutes, storage);
      case 'settings:get':
        return { ok: true, settings: await getSettings(storage) };
      case 'settings:update': {
        const settings = await updateSettings(message.settings, storage);
        await badge(await getSession(storage));
        return { ok: true, settings };
      }
      case 'notes:list':
        return { ok: true, note: await getVideoNote(message.videoId, storage) };
      case 'notes:add':
        return handleNotesAdd(message, storage);
      case 'notes:export':
        return handleNotesExport(message.videoId, storage);
      case 'transcript:get':
        return handleTranscriptGet(message.trackUrl, fetchFn);
      default:
        return { ok: false, error: 'Unsupported message.' };
    }
  };
}

export async function handleAlarm(storage?: StorageDriver): Promise<void> {
  await reconcileSessionState(storage);
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
}

function createSessionHistory(session: ActiveSession): StudySessionHistory {
  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    endedAt: null,
    videos: [],
  };
}

async function ensureSessionHistory(session: ActiveSession, storage?: StorageDriver): Promise<StudySessionHistory> {
  const existing = await getSessionHistory(storage);
  if (existing && existing.sessionId === session.id) {
    return existing;
  }

  const next = createSessionHistory(session);
  await setSessionHistory(next, storage);
  return next;
}

async function finalizeSessionHistory(sessionId: string, storage?: StorageDriver) {
  const existing = await getSessionHistory(storage);
  if (!existing || existing.sessionId !== sessionId || existing.endedAt !== null) {
    return;
  }

  await setSessionHistory(
    {
      ...existing,
      endedAt: Date.now(),
    },
    storage,
  );
}

async function syncHistoryNotes(note: VideoNote, storage?: StorageDriver) {
  const activeSession = await getSession(storage);
  if (!activeSession) {
    return;
  }

  const history = await getSessionHistory(storage);
  if (!history || history.sessionId !== activeSession.id) {
    return;
  }

  const existingIndex = history.videos.findIndex((entry) => entry.videoId === note.videoId);
  if (existingIndex === -1) {
    return;
  }

  history.videos[existingIndex] = {
    ...history.videos[existingIndex],
    title: note.title,
    url: note.url,
    notes: note.items,
    lastSeenAt: Date.now(),
  };
  await setSessionHistory(history, storage);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}
