import {
  DEFAULT_SETTINGS,
  LOCAL_ACTIVE_SESSION_KEY,
  LOCAL_NOTES_KEY,
  LOCAL_SESSION_HISTORY_KEY,
  SESSION_SCOPE,
  SYNC_SETTINGS_KEY,
} from './constants';
import { storageGet, storageRemove, storageSet } from './chrome';
import type { ActiveSession, NoteItem, SessionHistoryVideo, StudySessionHistory, StudySettings, VideoNote } from './types';

export interface StorageDriver {
  sync: chrome.storage.StorageArea;
  local: chrome.storage.StorageArea;
}

function requireChromeStorageArea(area: 'sync' | 'local'): chrome.storage.StorageArea {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    throw new Error(`chrome.storage.${area} is not available in this environment.`);
  }
  return chrome.storage[area];
}

export const chromeStorageDriver: StorageDriver = {
  get sync() {
    return requireChromeStorageArea('sync');
  },
  get local() {
    return requireChromeStorageArea('local');
  },
};

export function coerceStudySettings(input: unknown): StudySettings {
  const candidate = typeof input === 'object' && input ? (input as Partial<StudySettings>) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    defaultSessionMinutes: normalizePositiveNumber(candidate.defaultSessionMinutes, DEFAULT_SETTINGS.defaultSessionMinutes),
    presets: normalizePresetList(candidate.presets),
  };
}

export function coerceActiveSession(input: unknown): ActiveSession | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<ActiveSession>;
  if (candidate.scope !== SESSION_SCOPE) {
    return null;
  }
  if (candidate.status !== 'active' && candidate.status !== 'paused' && candidate.status !== 'expired') {
    return null;
  }
  const startedAt = normalizePositiveNumber(candidate.startedAt, 0);
  const endsAt = normalizePositiveNumber(candidate.endsAt, 0);
  const durationMinutes = normalizePositiveNumber(candidate.durationMinutes, 0);
  if (!startedAt || !endsAt || !durationMinutes) {
    return null;
  }
  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `legacy-${startedAt}`,
    status: candidate.status,
    startedAt,
    endsAt,
    durationMinutes,
    remainingMs:
      candidate.status === 'paused'
        ? normalizePositiveNumber(candidate.remainingMs, Math.max(0, endsAt - Date.now()))
        : undefined,
    scope: SESSION_SCOPE,
  };
}

export function coerceVideoNote(input: unknown): VideoNote | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<VideoNote>;
  if (!candidate.videoId || !candidate.title || !candidate.url) {
    return null;
  }
  const items = Array.isArray(candidate.items)
    ? candidate.items
        .map((item) => coerceNoteItem(item))
        .filter((item): item is NoteItem => item !== null)
    : [];
  return {
    videoId: candidate.videoId,
    title: candidate.title,
    url: candidate.url,
    updatedAt: normalizePositiveNumber(candidate.updatedAt, Date.now()),
    items,
  };
}

export function coerceSessionHistory(input: unknown): StudySessionHistory | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<StudySessionHistory>;
  if (!candidate.sessionId || !candidate.startedAt || !Array.isArray(candidate.videos)) {
    return null;
  }

  const videos = candidate.videos
    .map((item) => coerceSessionHistoryVideo(item))
    .filter((item): item is SessionHistoryVideo => item !== null);

  return {
    sessionId: candidate.sessionId,
    startedAt: normalizePositiveNumber(candidate.startedAt, Date.now()),
    endedAt: candidate.endedAt === null ? null : normalizePositiveNumber(candidate.endedAt, Date.now()),
    videos,
  };
}

function coerceNoteItem(input: unknown): NoteItem | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<NoteItem>;
  if (!candidate.id || typeof candidate.text !== 'string') {
    return null;
  }
  return {
    id: candidate.id,
    text: candidate.text.trim(),
    timestampSec: normalizePositiveNumber(candidate.timestampSec, 0),
    createdAt: normalizePositiveNumber(candidate.createdAt, Date.now()),
  };
}

function coerceSessionHistoryVideo(input: unknown): SessionHistoryVideo | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const candidate = input as Partial<SessionHistoryVideo>;
  if (!candidate.videoId || !candidate.title || !candidate.url || !Array.isArray(candidate.notes)) {
    return null;
  }

  const notes = candidate.notes
    .map((item) => coerceNoteItem(item))
    .filter((item): item is NoteItem => item !== null);

  return {
    videoId: candidate.videoId,
    title: candidate.title,
    url: candidate.url,
    firstSeenAt: normalizePositiveNumber(candidate.firstSeenAt, Date.now()),
    lastSeenAt: normalizePositiveNumber(candidate.lastSeenAt, Date.now()),
    notes,
  };
}

function normalizePresetList(input: unknown): number[] {
  if (!Array.isArray(input)) {
    return [...DEFAULT_SETTINGS.presets];
  }
  const values = input
    .map((value) => normalizePositiveNumber(value, 0))
    .filter((value) => value > 0);
  return values.length > 0 ? Array.from(new Set(values)) : [...DEFAULT_SETTINGS.presets];
}

function normalizePositiveNumber(input: unknown, fallback: number): number {
  return typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.round(input) : fallback;
}

export async function getSettings(driver: StorageDriver = chromeStorageDriver): Promise<StudySettings> {
  const values = await storageGet(driver.sync, SYNC_SETTINGS_KEY);
  return coerceStudySettings(values[SYNC_SETTINGS_KEY]);
}

export async function updateSettings(
  patch: Partial<StudySettings>,
  driver: StorageDriver = chromeStorageDriver,
): Promise<StudySettings> {
  const next = {
    ...(await getSettings(driver)),
    ...patch,
  };
  const coerced = coerceStudySettings(next);
  await storageSet(driver.sync, { [SYNC_SETTINGS_KEY]: coerced });
  return coerced;
}

export async function getSession(driver: StorageDriver = chromeStorageDriver): Promise<ActiveSession | null> {
  const values = await storageGet(driver.local, LOCAL_ACTIVE_SESSION_KEY);
  return coerceActiveSession(values[LOCAL_ACTIVE_SESSION_KEY]);
}

export async function setSession(
  session: ActiveSession,
  driver: StorageDriver = chromeStorageDriver,
): Promise<ActiveSession> {
  await storageSet(driver.local, { [LOCAL_ACTIVE_SESSION_KEY]: session });
  return session;
}

export async function clearSession(driver: StorageDriver = chromeStorageDriver): Promise<void> {
  await storageRemove(driver.local, LOCAL_ACTIVE_SESSION_KEY);
}

export async function getSessionHistory(driver: StorageDriver = chromeStorageDriver): Promise<StudySessionHistory | null> {
  const values = await storageGet(driver.local, LOCAL_SESSION_HISTORY_KEY);
  return coerceSessionHistory(values[LOCAL_SESSION_HISTORY_KEY]);
}

export async function setSessionHistory(
  history: StudySessionHistory,
  driver: StorageDriver = chromeStorageDriver,
): Promise<StudySessionHistory> {
  await storageSet(driver.local, { [LOCAL_SESSION_HISTORY_KEY]: history });
  return history;
}

export async function clearSessionHistory(driver: StorageDriver = chromeStorageDriver): Promise<void> {
  await storageRemove(driver.local, LOCAL_SESSION_HISTORY_KEY);
}

export async function getNoteMap(
  driver: StorageDriver = chromeStorageDriver,
): Promise<Record<string, VideoNote>> {
  const values = await storageGet(driver.local, LOCAL_NOTES_KEY);
  const candidate = values[LOCAL_NOTES_KEY];
  const rawMap = typeof candidate === 'object' && candidate ? (candidate as Record<string, unknown>) : {};
  const noteMap: Record<string, VideoNote> = {};

  for (const [videoId, value] of Object.entries(rawMap)) {
    const note = coerceVideoNote(value);
    if (note) {
      noteMap[videoId] = note;
    }
  }

  return noteMap;
}

export async function getVideoNote(
  videoId: string,
  driver: StorageDriver = chromeStorageDriver,
): Promise<VideoNote | null> {
  const noteMap = await getNoteMap(driver);
  return noteMap[videoId] ?? null;
}

export async function putVideoNote(
  note: VideoNote,
  driver: StorageDriver = chromeStorageDriver,
): Promise<VideoNote> {
  const noteMap = await getNoteMap(driver);
  noteMap[note.videoId] = note;
  await storageSet(driver.local, { [LOCAL_NOTES_KEY]: noteMap });
  return note;
}
