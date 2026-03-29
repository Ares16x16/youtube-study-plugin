import type { StudySettings } from './types';

export const EXTENSION_NAME = 'YouTube Study Mode';
export const DEFAULT_SESSION_MINUTES = 25;
export const SESSION_PRESETS = [25, 45, 60] as const;
export const SYNC_SETTINGS_KEY = 'studySettings';
export const LOCAL_ACTIVE_SESSION_KEY = 'activeSession';
export const LOCAL_NOTES_KEY = 'videoNotes';
export const LOCAL_SESSION_HISTORY_KEY = 'sessionHistory';
export const SESSION_ALARM_NAME = 'youtube-study-mode:session-tick';
export const SESSION_SCOPE = 'youtube-global' as const;
export const YOUTUBE_ORIGIN = 'https://www.youtube.com';
export const YOUTUBE_MATCH = 'https://www.youtube.com/*';
export const DEFAULT_THEME = 'system' as const;
export const DEFAULT_EXTEND_MINUTES = 15;
export const MAX_CUSTOM_MINUTES = 240;
export const MIN_CUSTOM_MINUTES = 5;

export const DEFAULT_SETTINGS: StudySettings = {
  defaultSessionMinutes: DEFAULT_SESSION_MINUTES,
  presets: [...SESSION_PRESETS],
  themePreference: DEFAULT_THEME,
  blockHome: true,
  blockShorts: true,
  blockSubscriptions: true,
  blockChannels: true,
  blockPlaylists: true,
  hideComments: true,
  hideLiveChat: true,
  hideRecommendations: true,
  hideShortShelves: true,
  hideAutoplay: true,
};
