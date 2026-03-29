import { startTransition, useEffect, useState } from 'react';

import { DEFAULT_EXTEND_MINUTES, MAX_CUSTOM_MINUTES, MIN_CUSTOM_MINUTES } from '../../src/shared/constants';
import { queryTabs, sendRuntimeMessage } from '../../src/shared/chrome';
import { downloadTextFile } from '../../src/shared/download';
import { getRouteInfo, getVideoId, type RouteInfo } from '../../src/shared/routes';
import { getSystemPrefersDark, resolveThemePreference, validateCustomMinutesInput } from '../../src/shared/theme';
import { formatCountdown, formatTimestampLabel, getRemainingMs, getSessionPhase } from '../../src/shared/time';
import type {
  ErrorResponse,
  NoteExportResponse,
  NotesResponse,
  ResolvedTheme,
  SessionResponse,
  SessionHistoryResponse,
  SettingsResponse,
  StudySessionHistory,
  StudySettings,
  ThemePreference,
} from '../../src/shared/types';

interface ActiveVideoSummary {
  videoId: string;
  title: string;
  url: string;
  noteCount: number;
}

interface PopupStatus {
  title: string;
  description: string;
  showWatchGuide: boolean;
}

const DEFAULT_STATUS: PopupStatus = {
  title: 'Open YouTube to use Study Mode.',
  description: 'Start a session to lock distracting surfaces and study on watch pages.',
  showWatchGuide: false,
};

export function App() {
  const [session, setSession] = useState<SessionResponse['session']>(null);
  const [settings, setSettings] = useState<StudySettings | null>(null);
  const [activeVideo, setActiveVideo] = useState<ActiveVideoSummary | null>(null);
  const [sessionHistory, setSessionHistory] = useState<StudySessionHistory | null>(null);
  const [customMinutes, setCustomMinutes] = useState('');
  const [status, setStatus] = useState<PopupStatus>(DEFAULT_STATUS);
  const [currentRoute, setCurrentRoute] = useState<RouteInfo | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  const [expandedHistoryVideoId, setExpandedHistoryVideoId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (getSessionPhase(session) !== 'active') {
      return undefined;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [session]);

  const resolvedTheme = resolveThemePreference(settings?.themePreference ?? 'system', systemPrefersDark);
  const customValidation = validateCustomMinutesInput(customMinutes);

  useEffect(() => {
    applyPopupTheme(resolvedTheme);
  }, [resolvedTheme]);

  async function refresh() {
    try {
      setError(null);
      const [sessionResponse, settingsResponse, historyResponse] = await Promise.all([
        sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:get' }),
        sendRuntimeMessage<SettingsResponse | ErrorResponse>({ type: 'settings:get' }),
        sendRuntimeMessage<SessionHistoryResponse | ErrorResponse>({ type: 'session:history:get' }),
      ]);

      if (!sessionResponse.ok || !settingsResponse.ok || !historyResponse.ok) {
        throw new Error('Failed to load popup state.');
      }

      setSession(sessionResponse.session);
      setSettings(settingsResponse.settings);
      setSessionHistory(historyResponse.history);
      await refreshTabSummary(sessionResponse.session, settingsResponse.settings);
      setNow(Date.now());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to load popup state.');
    }
  }

  async function refreshTabSummary(currentSession: SessionResponse['session'], currentSettings: StudySettings) {
    const [tab] = await queryTabs({ active: true, currentWindow: true });
    if (!tab?.url) {
      setActiveVideo(null);
      setCurrentRoute(null);
      setStatus(DEFAULT_STATUS);
      return;
    }

    const url = new URL(tab.url);
    if (url.hostname !== 'www.youtube.com') {
      setActiveVideo(null);
      setCurrentRoute(null);
      setStatus({
        title: 'YouTube Study Mode only runs on YouTube.',
        description: 'Open YouTube to start a session, block distractions, and use notes on a watch page.',
        showWatchGuide: false,
      });
      return;
    }

    const route = getRouteInfo(url, currentSettings);
    const phase = getSessionPhase(currentSession);
    setCurrentRoute(route);

    if (route.kind === 'watch') {
      const videoId = getVideoId(url);
      if (videoId) {
        const noteResponse = await sendRuntimeMessage<NotesResponse | ErrorResponse>({ type: 'notes:list', videoId });
        setActiveVideo({
          videoId,
          title: tab.title ?? 'Current video',
          url: url.toString(),
          noteCount: noteResponse.ok ? noteResponse.note?.items.length ?? 0 : 0,
        });
      } else {
        setActiveVideo(null);
      }
    } else {
      setActiveVideo(null);
    }

    setStatus(buildPopupStatus(route, phase));
  }

  async function performAction(action: string, callback: () => Promise<void>) {
    setBusyAction(action);
    setError(null);
    try {
      await callback();
      await refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Action failed.');
    } finally {
      setBusyAction(null);
    }
  }

  async function startSession(minutes: number) {
    await performAction(`start-${minutes}`, async () => {
      const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({
        type: 'session:start',
        durationMinutes: minutes,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
    });
  }

  async function extendSession(minutes = DEFAULT_EXTEND_MINUTES) {
    await performAction(`extend-${minutes}`, async () => {
      const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({
        type: 'session:extend',
        durationMinutes: minutes,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
    });
  }

  async function pauseSession() {
    await performAction('pause', async () => {
      const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:pause' });
      if (!response.ok) {
        throw new Error(response.error);
      }
    });
  }

  async function resumeSession() {
    await performAction('resume', async () => {
      const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:resume' });
      if (!response.ok) {
        throw new Error(response.error);
      }
    });
  }

  async function endSession() {
    await performAction('end', async () => {
      const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:end', reason: 'manual' });
      if (!response.ok) {
        throw new Error(response.error);
      }
    });
  }

  async function exportVideoNotes(videoId: string, actionKey: string) {
    await performAction(actionKey, async () => {
      const response = await sendRuntimeMessage<NoteExportResponse | ErrorResponse>({
        type: 'notes:export',
        videoId,
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      downloadTextFile(response.filename, response.markdown);
    });
  }

  async function updateSetting<K extends keyof StudySettings>(key: K, value: StudySettings[K]) {
    if (!settings) {
      return;
    }
    const next = { ...settings, [key]: value };
    setSettings(next);
    startTransition(async () => {
      const response = await sendRuntimeMessage<SettingsResponse | ErrorResponse>({
        type: 'settings:update',
        settings: { [key]: value } as Partial<StudySettings>,
      });
      if (response.ok) {
        setSettings(response.settings);
      } else {
        setError(response.error);
      }
    });
  }

  async function clearSessionHistory() {
    await performAction('clear-history', async () => {
      const response = await sendRuntimeMessage<SessionHistoryResponse | ErrorResponse>({
        type: 'session:history:clear',
      });
      if (!response.ok) {
        throw new Error(response.error);
      }
      setExpandedHistoryVideoId(null);
    });
  }

  const phase = getSessionPhase(session, now);
  const countdown = formatCountdown(getRemainingMs(session, now));
  const isWatchPage = currentRoute?.kind === 'watch';

  return (
    <main className="popup-shell">
      <section className="hero">
        <div>
          <p className="brand-title">YouTube Study Mode</p>
        </div>
        <div className={`session-pill session-pill--${phase}`}>
          {phase === 'active' ? countdown : phase === 'expired' ? 'Expired' : phase === 'paused' ? 'Paused' : 'Idle'}
        </div>
      </section>

      <section className="panel">
        <p className="panel-label">Current state</p>
        <h2 className="status-title">{status.title}</h2>
        <p className="status-text">{status.description}</p>
        {activeVideo ? (
          <div className="video-summary">
            <span className="video-summary__title">{activeVideo.title}</span>
            <span>
              {activeVideo.noteCount} note{activeVideo.noteCount === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
      </section>

      {phase === 'active' ? (
        <section className="panel">
          <div className="panel-row">
            <div>
              <p className="panel-label">Active session</p>
              <strong>{countdown} remaining</strong>
            </div>
            <button className="ghost-button" disabled={busyAction !== null} onClick={() => void extendSession()}>
              +{DEFAULT_EXTEND_MINUTES} min
            </button>
          </div>
          <div className="button-grid button-grid--triple">
            <button className="primary-button" disabled={busyAction !== null} onClick={() => void extendSession()}>
              Extend
            </button>
            <button className="ghost-button" disabled={busyAction !== null} onClick={() => void pauseSession()}>
              Break
            </button>
            <button className="ghost-button" disabled={busyAction !== null} onClick={() => void endSession()}>
              End
            </button>
          </div>
        </section>
      ) : phase === 'paused' ? (
        <section className="panel">
          <p className="panel-label">Paused session</p>
          <p className="status-text">The timer is paused and YouTube is unlocked. Resume when you want Study Mode to start blocking again.</p>
          <div className="button-grid">
            <button className="primary-button" disabled={busyAction !== null} onClick={() => void resumeSession()}>
              Resume
            </button>
            <button className="ghost-button" disabled={busyAction !== null} onClick={() => void endSession()}>
              End
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p className="panel-label">Start a session</p>
          <div className="preset-grid">
            {settings?.presets.map((preset) => (
              <button
                key={preset}
                className="preset-button"
                disabled={busyAction !== null}
                onClick={() => void startSession(preset)}
              >
                {preset} min
              </button>
            ))}
          </div>
          <div className="custom-row">
            <input
              type="number"
              min={MIN_CUSTOM_MINUTES}
              max={MAX_CUSTOM_MINUTES}
              step={1}
              placeholder="Custom"
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
            />
            <button
              className="primary-button"
              disabled={busyAction !== null || customValidation.value === null}
              onClick={() => {
                if (customValidation.value !== null) {
                  void startSession(customValidation.value);
                }
              }}
            >
              Start
            </button>
          </div>
          <p className={`input-helper${customValidation.error ? ' input-helper--error' : ''}`}>
            {customValidation.error ?? `Use ${MIN_CUSTOM_MINUTES}-${MAX_CUSTOM_MINUTES} whole minutes.`}
          </p>
          {phase === 'expired' ? (
            <div className="button-grid">
              <button className="primary-button" disabled={busyAction !== null} onClick={() => void extendSession()}>
                Resume
              </button>
              <button className="ghost-button" disabled={busyAction !== null} onClick={() => void endSession()}>
                Clear
              </button>
            </div>
          ) : null}
        </section>
      )}

      {status.showWatchGuide && isWatchPage ? (
        <section className="panel">
          <p className="panel-label">How notes work</p>
          <ul className="helper-list">
            <li>Add a note from the Study panel beside the video. It uses the current playback time automatically.</li>
            <li>Click any saved note or transcript line to jump back to that exact moment in the video.</li>
            <li>Export your notes as Markdown from this popup when you want to keep them outside YouTube.</li>
          </ul>
          {activeVideo ? (
            <button
              className="ghost-button"
              disabled={busyAction !== null || activeVideo.noteCount === 0}
              onClick={() => void exportVideoNotes(activeVideo.videoId, 'export-current')}
            >
              {activeVideo.noteCount > 0 ? 'Download Markdown export' : 'No notes to export yet'}
            </button>
          ) : null}
        </section>
      ) : null}

      {sessionHistory && sessionHistory.videos.length > 0 ? (
        <section className="panel">
          <div className="panel-row">
            <p className="panel-label">Session history</p>
            <button className="ghost-button" disabled={busyAction !== null} onClick={() => void clearSessionHistory()}>
              Clear history
            </button>
          </div>
          <ul className="history-list">
            {sessionHistory.videos.map((entry) => (
              <li key={entry.videoId} className="history-item">
                <button
                  className="history-item__toggle"
                  onClick={() => {
                    setExpandedHistoryVideoId((current) => (current === entry.videoId ? null : entry.videoId));
                  }}
                >
                  <span className="history-item__title">{entry.title}</span>
                  <span className="history-item__meta">
                    {entry.notes.length} note{entry.notes.length === 1 ? '' : 's'} •{' '}
                    {expandedHistoryVideoId === entry.videoId ? 'Hide' : 'Show'}
                  </span>
                </button>
                {expandedHistoryVideoId === entry.videoId ? (
                  <div className="history-item__body">
                    {entry.notes.length === 0 ? (
                      <p className="history-item__empty">No notes saved for this video yet.</p>
                    ) : (
                      <ul className="history-notes">
                        {entry.notes.map((note) => (
                          <li key={note.id} className="history-note">
                            <span className="history-note__time">{formatTimestampLabel(note.timestampSec)}</span>
                            <span>{note.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      className="ghost-button"
                      disabled={busyAction !== null || entry.notes.length === 0}
                      onClick={() => void exportVideoNotes(entry.videoId, `export-${entry.videoId}`)}
                    >
                      Download this video's markdown
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <p className="panel-label">Popup settings</p>
        <label className="field">
          <span>Default duration</span>
          <input
            type="number"
            min={MIN_CUSTOM_MINUTES}
            max={MAX_CUSTOM_MINUTES}
            value={settings?.defaultSessionMinutes ?? 25}
            onChange={(event) =>
              void updateSetting('defaultSessionMinutes', Math.max(MIN_CUSTOM_MINUTES, Number(event.target.value)))
            }
          />
        </label>
        <label className="field">
          <span>Theme</span>
          <select
            value={settings?.themePreference ?? 'system'}
            onChange={(event) => void updateSetting('themePreference', event.target.value as ThemePreference)}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>

      <footer className="author-footer">
        <span>Author:</span>{' '}
        <a className="author-link" href="https://github.com/Ares16x16" target="_blank" rel="noreferrer noopener">
          Ares16x16
        </a>
      </footer>

      {error ? <p className="error-banner">{error}</p> : null}
    </main>
  );
}

function applyPopupTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function buildPopupStatus(
  route: RouteInfo,
  phase: ReturnType<typeof getSessionPhase>,
): PopupStatus {
  if (phase === 'paused') {
    return {
      title: 'Study Mode is paused.',
      description: 'YouTube is unlocked until you resume the session. Resume when you want blocking and the study panel back.',
      showWatchGuide: route.kind === 'watch',
    };
  }

  if (phase === 'expired') {
    return {
      title: 'The last study session finished.',
      description: 'Resume to keep studying with blocking enabled, or clear the session to return to normal browsing.',
      showWatchGuide: route.kind === 'watch',
    };
  }

  if (phase === 'idle') {
    if (route.kind === 'watch') {
      return {
        title: 'This video is ready for a study session.',
        description: 'Start a session to keep this watch page open, hide distractions, and unlock timestamped notes beside the player.',
        showWatchGuide: false,
      };
    }

    return {
      title: `${route.label} is open right now.`,
      description: 'Start a session to allow only search and watch pages while Study Mode blocks distracting routes.',
      showWatchGuide: false,
    };
  }

  if (route.kind === 'watch') {
    return {
      title: 'Study happens on this watch page.',
      description: 'This page stays open so you can watch, read the transcript, and add timestamped notes from the Study panel beside the video.',
      showWatchGuide: true,
    };
  }

  if (route.kind === 'results') {
    return {
      title: 'Search stays available during Study Mode.',
      description: 'Use search to find the exact video you need, then open the watch page to study and take notes.',
      showWatchGuide: false,
    };
  }

  return {
    title: `${route.label} will lock during the session.`,
    description: 'This route is treated as a distraction surface. Use Break to pause and unlock YouTube temporarily, or open search to find a video directly.',
    showWatchGuide: false,
  };
}
