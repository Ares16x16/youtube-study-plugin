export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export interface StudySettings {
  defaultSessionMinutes: number;
  presets: number[];
  themePreference: ThemePreference;
  blockHome: boolean;
  blockShorts: boolean;
  blockSubscriptions: boolean;
  blockChannels: boolean;
  blockPlaylists: boolean;
  hideComments: boolean;
  hideLiveChat: boolean;
  hideRecommendations: boolean;
  hideShortShelves: boolean;
  hideAutoplay: boolean;
}

export type SessionStatus = 'active' | 'paused' | 'expired';

export interface ActiveSession {
  id: string;
  status: SessionStatus;
  startedAt: number;
  endsAt: number;
  durationMinutes: number;
  remainingMs?: number;
  scope: 'youtube-global';
}

export interface NoteItem {
  id: string;
  timestampSec: number;
  text: string;
  createdAt: number;
}

export interface VideoNote {
  videoId: string;
  title: string;
  url: string;
  updatedAt: number;
  items: NoteItem[];
}

export interface SessionHistoryVideo {
  videoId: string;
  title: string;
  url: string;
  firstSeenAt: number;
  lastSeenAt: number;
  notes: NoteItem[];
}

export interface StudySessionHistory {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  videos: SessionHistoryVideo[];
}

export interface TranscriptTrack {
  id: string;
  languageCode: string;
  label: string;
  kind?: string;
  isDefault: boolean;
  trackUrl: string;
}

export interface TranscriptCue {
  startSec: number;
  durationSec: number;
  text: string;
}

export interface PlayerBootstrapData {
  title: string;
  videoId: string;
  tracks: TranscriptTrack[];
}

export type RuntimeMessage =
  | { type: 'session:get' }
  | { type: 'session:history:get' }
  | { type: 'session:history:clear' }
  | { type: 'session:history:track'; videoId: string; title: string; url: string }
  | { type: 'session:start'; durationMinutes: number }
  | { type: 'session:end'; reason?: 'manual' | 'expired' }
  | { type: 'session:pause' }
  | { type: 'session:resume' }
  | { type: 'session:extend'; durationMinutes: number }
  | { type: 'notes:list'; videoId: string }
  | {
      type: 'notes:add';
      videoId: string;
      title: string;
      url: string;
      text: string;
      timestampSec: number;
    }
  | { type: 'notes:export'; videoId: string }
  | { type: 'transcript:get'; trackUrl: string }
  | { type: 'settings:get' }
  | { type: 'settings:update'; settings: Partial<StudySettings> };

export interface SessionResponse {
  ok: true;
  session: ActiveSession | null;
}

export interface SessionHistoryResponse {
  ok: true;
  history: StudySessionHistory | null;
}

export interface SettingsResponse {
  ok: true;
  settings: StudySettings;
}

export interface NotesResponse {
  ok: true;
  note: VideoNote | null;
}

export interface NoteExportResponse {
  ok: true;
  filename: string;
  markdown: string;
}

export interface TranscriptResponse {
  ok: true;
  cues: TranscriptCue[];
}

export interface ErrorResponse {
  ok: false;
  error: string;
}

export type RuntimeResponse =
  | SessionResponse
  | SessionHistoryResponse
  | SettingsResponse
  | NotesResponse
  | NoteExportResponse
  | TranscriptResponse
  | ErrorResponse;
