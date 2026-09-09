import { useEffect, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import ReactDOM from 'react-dom/client';
import { defineContentScript } from 'wxt/utils/define-content-script';

import { DEFAULT_EXTEND_MINUTES, DEFAULT_SETTINGS, LOCAL_ACTIVE_SESSION_KEY, SYNC_SETTINGS_KEY } from '../../src/shared/constants';
import { sendRuntimeMessage } from '../../src/shared/chrome';
import { downloadTextFile } from '../../src/shared/download';
import { getRouteInfo, getVideoId, type RouteInfo } from '../../src/shared/routes';
import { coerceActiveSession, coerceStudySettings } from '../../src/shared/storage';
import { getSystemPrefersDark, getThemePalette, resolveThemePreference } from '../../src/shared/theme';
import { pickPrimaryTrack } from '../../src/shared/transcript';
import { formatCountdown, formatTimestampLabel, getRemainingMs, getSessionPhase } from '../../src/shared/time';
import type {
  ActiveSession,
  NotesResponse,
  PlayerBootstrapData,
  SessionResponse,
  SettingsResponse,
  StudySettings,
  TranscriptCue,
  TranscriptResponse,
  VideoNote,
  ErrorResponse,
  NoteExportResponse,
  ResolvedTheme,
} from '../../src/shared/types';
import './style.css';

interface TranscriptState {
  status: 'idle' | 'loading' | 'ready' | 'empty' | 'error';
  cues: TranscriptCue[];
  error: string | null;
  trackUrl: string | null;
}

interface ContentState {
  session: ActiveSession | null;
  settings: StudySettings;
  resolvedTheme: ResolvedTheme;
  route: RouteInfo;
  now: number;
  playerData: PlayerBootstrapData | null;
  note: VideoNote | null;
  transcript: TranscriptState;
  exportFeedback: string | null;
  actionError: string | null;
}

function getRuntimeUrl() {
  if (
    typeof window === 'undefined'
    || !window.location
    || typeof window.location.href !== 'string'
  ) {
    return 'https://www.youtube.com/';
  }
  return window.location.href;
}

const state: ContentState = {
  session: null,
  settings: DEFAULT_SETTINGS,
  resolvedTheme: resolveThemePreference(DEFAULT_SETTINGS.themePreference, getSystemPrefersDark()),
  route: getRouteInfo(getRuntimeUrl(), DEFAULT_SETTINGS),
  now: Date.now(),
  playerData: null,
  note: null,
  transcript: {
    status: 'idle',
    cues: [],
    error: null,
    trackUrl: null,
  },
  exportFeedback: null,
  actionError: null,
};

let overlayHost: HTMLDivElement | null = null;
let overlayRoot: ReactDOM.Root | null = null;
let panelHost: HTMLDivElement | null = null;
let panelRoot: ReactDOM.Root | null = null;
let lastUrl = getRuntimeUrl();
let refreshToken = 0;
let pageScriptReadyPromise: Promise<void> | null = null;
let historyHooksInstalled = false;
let busyAction = false;

const PAGE_SCRIPT_ID = 'yt-study-mode-page-script';
type PanelMountMode = 'sidebar' | 'floating';

function setState(patch: Partial<ContentState>) {
  Object.assign(state, patch);
  renderAll();
}

function ensurePageScript(): Promise<void> {
  if (pageScriptReadyPromise) {
    return pageScriptReadyPromise;
  }

  pageScriptReadyPromise = new Promise((resolve) => {
    const existing = document.getElementById(PAGE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    script.id = PAGE_SCRIPT_ID;
    script.type = 'module';
    script.src = chrome.runtime.getURL('/youtube-player-data.js');
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => resolve(), { once: true });

    if (!existing) {
      (document.head ?? document.documentElement).appendChild(script);
    }
  });

  return pageScriptReadyPromise;
}

async function requestPlayerData(): Promise<PlayerBootstrapData | null> {
  await ensurePageScript();
  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        document.removeEventListener('yt-study-mode:player-data', onPlayerData as EventListener);
        resolve(null);
      }
    }, 1_500);

    function onPlayerData(event: Event) {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeout);
      document.removeEventListener('yt-study-mode:player-data', onPlayerData as EventListener);
      const detail = (event as CustomEvent<PlayerBootstrapData | null>).detail;
      resolve(detail ?? null);
    }

    document.addEventListener('yt-study-mode:player-data', onPlayerData as EventListener);
    document.dispatchEvent(new CustomEvent('yt-study-mode:get-player-data'));
  });
}

function ensureOverlayRoot() {
  if (overlayHost?.isConnected && overlayRoot) {
    return;
  }
  overlayHost = document.createElement('div');
  overlayHost.id = 'yt-study-mode-overlay-host';
  const shadowRoot = overlayHost.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(overlayHost);
  overlayRoot = ReactDOM.createRoot(shadowRoot);
}

function ensurePanelRoot() {
  const { anchor, mode } = resolvePanelMount();
  if (!anchor) {
    return;
  }
  if (!panelHost?.isConnected) {
    panelHost = document.createElement('div');
    panelHost.id = 'yt-study-mode-panel-host';
    const shadowRoot = panelHost.attachShadow({ mode: 'open' });
    panelRoot = ReactDOM.createRoot(shadowRoot);
  }
  applyPanelHostLayout(mode);
  if (panelHost.parentElement !== anchor) {
    anchor.appendChild(panelHost);
  }
}

function disposePanelRoot() {
  panelRoot?.render(null);
  panelHost?.remove();
}

function updateDocumentAttributes() {
  const phase = getSessionPhase(state.session, state.now);
  const settings = state.settings;
  document.documentElement.dataset.studyModeSession = phase;
  document.documentElement.dataset.studyModeRoute = state.route.kind;
  document.documentElement.dataset.studyModeTheme = state.resolvedTheme;
  document.documentElement.dataset.studyHideComments = String(settings.hideComments);
  document.documentElement.dataset.studyHideLiveChat = String(settings.hideLiveChat);
  document.documentElement.dataset.studyHideRecommendations = String(settings.hideRecommendations);
  document.documentElement.dataset.studyHideShortShelves = String(settings.hideShortShelves);
  document.documentElement.dataset.studyHideAutoplay = String(settings.hideAutoplay);
}

function shouldShowOverlay() {
  const phase = getSessionPhase(state.session, state.now);
  if (phase === 'expired') {
    return true;
  }
  return phase === 'active' && !state.route.allowedDuringSession;
}

function shouldShowPanel() {
  if (getSessionPhase(state.session, state.now) !== 'active') {
    return false;
  }
  const liveRoute = getRouteInfo(window.location.href, state.settings);
  return liveRoute.kind === 'watch';
}

function renderAll() {
  updateDocumentAttributes();
  renderOverlay();
  renderPanel();
}

function renderOverlay() {
  ensureOverlayRoot();
  if (!overlayRoot) {
    return;
  }

  if (!shouldShowOverlay()) {
    overlayRoot.render(null);
    return;
  }

  const phase = getSessionPhase(state.session, state.now);
  if (phase !== 'active' && phase !== 'expired') {
    overlayRoot.render(null);
    return;
  }

  overlayRoot.render(
    <OverlayShell
      phase={phase}
      theme={state.resolvedTheme}
      routeLabel={state.route.label}
      countdown={formatCountdown(getRemainingMs(state.session, state.now))}
      busy={busyAction}
      actionError={state.actionError}
      onExtend={() => void runOverlayAction('extend', extendSession)}
      onEnd={() => void runOverlayAction('end', endSession)}
      onBreak={() => void runOverlayAction('break', pauseSession)}
      onOpenSearch={() => {
        window.location.assign('https://www.youtube.com/results?search_query=');
      }}
    />,
  );
}

function renderPanel() {
  if (!shouldShowPanel()) {
    disposePanelRoot();
    return;
  }

  ensurePanelRoot();
  if (!panelRoot) {
    return;
  }

  const primaryTrack = pickPrimaryTrack(state.playerData?.tracks ?? []);

  panelRoot.render(
    <StudyPanel
      theme={state.resolvedTheme}
      note={state.note}
      playerData={state.playerData}
      fallbackTitle={getFallbackVideoTitle()}
      transcript={state.transcript}
      primaryTrackLabel={primaryTrack?.label ?? null}
      onAddNote={(text) => addNote(text)}
      onExport={() => exportNotes()}
      onRetryTranscript={() => void loadTranscript(primaryTrack?.trackUrl ?? null)}
      onSeekCue={(startSec) => seekTo(startSec)}
      exportFeedback={state.exportFeedback}
      now={state.now}
    />,
  );
}

async function runOverlayAction(name: string, action: () => Promise<void>) {
  if (busyAction) {
    return;
  }
  busyAction = true;
  setState({ actionError: null });
  try {
    await action();
  } catch (error) {
    setState({
      actionError: error instanceof Error ? error.message : `Failed to ${name} session.`,
    });
  } finally {
    busyAction = false;
    renderAll();
  }
}

function readCurrentVideoTime() {
  const videoElement = document.querySelector<HTMLVideoElement>('video');
  return videoElement?.currentTime ?? 0;
}

function seekTo(startSec: number) {
  const videoElement = document.querySelector<HTMLVideoElement>('video');
  if (!videoElement) {
    return;
  }
  videoElement.currentTime = startSec;
  void videoElement.play().catch(() => {
    return;
  });
}

async function addNote(text: string): Promise<boolean> {
  const videoId = state.playerData?.videoId ?? getVideoId(window.location.href);
  if (!videoId) {
    return false;
  }

  const response = await sendRuntimeMessage<NotesResponse | ErrorResponse>({
    type: 'notes:add',
    videoId,
    title: state.playerData?.title ?? getFallbackVideoTitle(),
    url: canonicalVideoUrl(videoId),
    text,
    timestampSec: readCurrentVideoTime(),
  });

  if (!response.ok) {
    setState({ exportFeedback: response.error });
    return false;
  }

  setState({ note: response.note, exportFeedback: null });
  return true;
}

async function exportNotes() {
  const videoId = state.playerData?.videoId ?? getVideoId(window.location.href);
  if (!videoId) {
    return;
  }

  const response = await sendRuntimeMessage<NoteExportResponse | ErrorResponse>({
    type: 'notes:export',
    videoId,
  });

  if (!response.ok) {
    setState({ exportFeedback: response.error });
    return;
  }

  downloadTextFile(response.filename, response.markdown);
  setState({ exportFeedback: 'Markdown downloaded.' });
  window.setTimeout(() => {
    if (state.exportFeedback === 'Markdown downloaded.') {
      setState({ exportFeedback: null });
    }
  }, 2_000);
}

async function loadTranscript(trackUrl: string | null) {
  if (!trackUrl) {
    setState({
      transcript: {
        status: 'empty',
        cues: [],
        error: null,
        trackUrl: null,
      },
    });
    return;
  }

  if (state.transcript.trackUrl === trackUrl && state.transcript.status === 'ready') {
    return;
  }

  setState({
    transcript: {
      status: 'loading',
      cues: [],
      error: null,
      trackUrl,
    },
  });

  const response = await sendRuntimeMessage<TranscriptResponse | ErrorResponse>({
    type: 'transcript:get',
    trackUrl,
  });

  if (!response.ok) {
    setState({
      transcript: {
        status: 'error',
        cues: [],
        error: response.error,
        trackUrl,
      },
    });
    return;
  }

  setState({
    transcript: {
      status: response.cues.length > 0 ? 'ready' : 'empty',
      cues: response.cues,
      error: null,
      trackUrl,
    },
  });
}

async function extendSession() {
  const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({
    type: 'session:extend',
    durationMinutes: DEFAULT_EXTEND_MINUTES,
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
  setState({ session: response.session, now: Date.now(), actionError: null });
}

async function pauseSession() {
  const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:pause' });
  if (!response.ok) {
    throw new Error(response.error);
  }
  setState({ session: response.session, now: Date.now(), actionError: null });
}

async function endSession() {
  const response = await sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:end', reason: 'manual' });
  if (!response.ok) {
    throw new Error(response.error);
  }
  setState({ session: response.session, now: Date.now(), actionError: null });
}

function canonicalVideoUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function getFallbackVideoTitle() {
  const title = document.title.replace(/\s*-\s*YouTube$/, '').trim();
  return title || 'Current video';
}

function resolvePanelMount(): { anchor: HTMLElement | null; mode: PanelMountMode } {
  const sidebar = document.querySelector<HTMLElement>('#secondary');
  if (isVisibleMountAnchor(sidebar)) {
    return { anchor: sidebar, mode: 'sidebar' };
  }

  return {
    anchor: document.body,
    mode: 'floating',
  };
}

function isVisibleMountAnchor(anchor: HTMLElement | null): anchor is HTMLElement {
  if (!anchor) {
    return false;
  }

  const style = window.getComputedStyle(anchor);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = anchor.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function applyPanelHostLayout(mode: PanelMountMode) {
  if (!panelHost) {
    return;
  }

  panelHost.dataset.mode = mode;
  panelHost.style.display = 'block';
  panelHost.style.width = mode === 'floating' ? 'min(380px, calc(100vw - 32px))' : '100%';
  panelHost.style.maxWidth = mode === 'floating' ? '400px' : 'unset';
  panelHost.style.marginTop = mode === 'sidebar' ? '0' : '16px';
  panelHost.style.marginLeft = '0';
  panelHost.style.marginRight = '0';
  panelHost.style.position = mode === 'floating' ? 'fixed' : 'relative';
  panelHost.style.top = mode === 'floating' ? '88px' : '';
  panelHost.style.right = mode === 'floating' ? '20px' : '';
  panelHost.style.zIndex = mode === 'floating' ? '2147483646' : '';
}

async function refreshPageState(options: { syncSession?: boolean; syncSettings?: boolean } = {}) {
  const token = ++refreshToken;

  if (options.syncSettings) {
    const settingsResponse = await sendRuntimeMessage<SettingsResponse | ErrorResponse>({ type: 'settings:get' });
    if (token !== refreshToken) {
      return;
    }
    if (settingsResponse.ok) {
      state.settings = settingsResponse.settings;
      state.resolvedTheme = resolveThemePreference(settingsResponse.settings.themePreference, getSystemPrefersDark());
    }
  }

  if (options.syncSession) {
    const sessionResponse = await sendRuntimeMessage<SessionResponse | ErrorResponse>({ type: 'session:get' });
    if (token !== refreshToken || !sessionResponse.ok) {
      return;
    }
    state.session = sessionResponse.session;
  }

  state.route = getRouteInfo(window.location.href, state.settings);
  state.now = Date.now();

  if (!shouldShowPanel()) {
    state.playerData = null;
    state.note = null;
    state.transcript = {
      status: 'idle',
      cues: [],
      error: null,
      trackUrl: null,
    };
    renderAll();
    return;
  }

  const playerData = await requestPlayerData();
  if (token !== refreshToken) {
    return;
  }

  state.playerData = playerData;

  const videoId = playerData?.videoId ?? getVideoId(window.location.href);
  if (!videoId) {
    state.note = null;
    state.transcript = {
      status: 'empty',
      cues: [],
      error: 'Transcript unavailable for this video.',
      trackUrl: null,
    };
    renderAll();
    return;
  }

  await sendRuntimeMessage({
    type: 'session:history:track',
    videoId,
    title: playerData?.title ?? getFallbackVideoTitle(),
    url: canonicalVideoUrl(videoId),
  });

  const noteResponse = await sendRuntimeMessage<NotesResponse | ErrorResponse>({ type: 'notes:list', videoId });
  if (token !== refreshToken) {
    return;
  }

  state.note = noteResponse.ok ? noteResponse.note : null;
  const primaryTrack = pickPrimaryTrack(playerData?.tracks ?? []);
  renderAll();
  await loadTranscript(primaryTrack?.trackUrl ?? null);
}

function onStorageChanged(changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) {
  if (areaName === 'local' && changes[LOCAL_ACTIVE_SESSION_KEY]) {
    setState({
      session: coerceActiveSession(changes[LOCAL_ACTIVE_SESSION_KEY].newValue),
      now: Date.now(),
    });
    void refreshPageState();
  }

  if (areaName === 'sync' && changes[SYNC_SETTINGS_KEY]) {
    const settings = coerceStudySettings(changes[SYNC_SETTINGS_KEY].newValue);
    setState({
      settings,
      resolvedTheme: resolveThemePreference(settings.themePreference, getSystemPrefersDark()),
      route: getRouteInfo(window.location.href, settings),
    });
    void refreshPageState();
  }
}

function maybeHandleUrlChange() {
  if (window.location.href === lastUrl) {
    return;
  }
  lastUrl = window.location.href;
  state.route = getRouteInfo(window.location.href, state.settings);
  state.now = Date.now();
  state.transcript = {
    status: 'idle',
    cues: [],
    error: null,
    trackUrl: null,
  };
  renderAll();
  void refreshPageState({ syncSession: true });
}

function installHistoryHooks() {
  if (historyHooksInstalled) {
    return;
  }
  historyHooksInstalled = true;

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function pushState(...args) {
    const result = originalPushState(...args);
    queueMicrotask(maybeHandleUrlChange);
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState(...args);
    queueMicrotask(maybeHandleUrlChange);
    return result;
  };
}

function OverlayShell(props: {
  phase: 'active' | 'expired';
  theme: ResolvedTheme;
  routeLabel: string;
  countdown: string;
  busy: boolean;
  actionError: string | null;
  onExtend: () => void;
  onEnd: () => void;
  onBreak: () => void;
  onOpenSearch: () => void;
}) {
  const styles = createOverlayStyles(props.theme);
  const heading =
    props.phase === 'expired' ? 'Study session finished.' : `${props.routeLabel} is locked during the session.`;
  const body =
    props.phase === 'expired'
      ? `Extend by ${DEFAULT_EXTEND_MINUTES} minutes to keep studying with blocking enabled, or end the session to browse YouTube normally.`
      : 'Only search results and direct watch pages stay available while Study Mode is active. Take a Break to pause the timer and unlock YouTube temporarily.';

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-label="YouTube Study Mode lock screen">
      <div style={styles.card}>
        <p style={styles.eyebrow}>YouTube Study Mode</p>
        <h2 style={styles.title}>{heading}</h2>
        <p style={styles.body}>{body}</p>
        {props.phase === 'active' ? <div style={styles.timer}>{props.countdown} remaining</div> : null}
        <div style={styles.actions}>
          <button style={styles.primaryButton} disabled={props.busy} onClick={props.onExtend}>
            Extend {DEFAULT_EXTEND_MINUTES} min
          </button>
          {props.phase === 'active' ? (
            <button style={styles.secondaryButton} disabled={props.busy} onClick={props.onOpenSearch}>
              Open search
            </button>
          ) : (
            <button style={styles.secondaryButton} disabled={props.busy} onClick={props.onEnd}>
              End session
            </button>
          )}
        </div>
        {props.phase === 'active' ? (
          <div style={styles.actions}>
            <button style={styles.ghostButton} disabled={props.busy} onClick={props.onBreak}>
              Break
            </button>
            <button style={styles.ghostButton} disabled={props.busy} onClick={props.onEnd}>
              End session
            </button>
          </div>
        ) : null}
        {props.actionError ? <p style={styles.error}>{props.actionError}</p> : null}
      </div>
    </div>
  );
}

function StudyPanel(props: {
  theme: ResolvedTheme;
  playerData: PlayerBootstrapData | null;
  fallbackTitle: string;
  note: VideoNote | null;
  transcript: TranscriptState;
  primaryTrackLabel: string | null;
  onAddNote: (text: string) => Promise<boolean>;
  onExport: () => void;
  onRetryTranscript: () => void;
  onSeekCue: (startSec: number) => void;
  exportFeedback: string | null;
  now: number;
}) {
  const [draft, setDraft] = useState('');
  const [activeTab, setActiveTab] = useState<'notes' | 'transcript'>('notes');
  const [isSaving, setIsSaving] = useState(false);
  const [videoTime, setVideoTime] = useState(() => readCurrentVideoTime());
  const styles = createPanelStyles(props.theme);
  const noteCount = props.note?.items.length ?? 0;

  useEffect(() => {
    const timer = window.setInterval(() => setVideoTime(readCurrentVideoTime()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setDraft('');
  }, [props.playerData?.videoId]);

  async function handleAddNote() {
    if (!draft.trim() || isSaving) {
      return;
    }
    setIsSaving(true);
    const saved = await props.onAddNote(draft.trim());
    setIsSaving(false);
    if (saved) {
      setDraft('');
    }
  }

  function suppressYoutubeShortcuts(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    event.stopPropagation();
    const nativeEvent = event.nativeEvent as KeyboardEvent & {
      stopImmediatePropagation?: () => void;
    };
    nativeEvent.stopImmediatePropagation?.();

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleAddNote();
    }
  }

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Study panel</p>
          <h2 style={styles.title}>{props.playerData?.title ?? props.fallbackTitle}</h2>
        </div>
        <button style={styles.exportButton} onClick={props.onExport} disabled={noteCount === 0}>
          Export
        </button>
      </div>

      <div style={styles.tabs}>
        <button style={activeTab === 'notes' ? styles.activeTab : styles.tab} onClick={() => setActiveTab('notes')}>
          Notes{noteCount > 0 ? ` (${noteCount})` : ''}
        </button>
        <button
          style={activeTab === 'transcript' ? styles.activeTab : styles.tab}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
      </div>

      {activeTab === 'notes' ? (
        <div style={styles.section}>
          <textarea
            style={styles.textarea}
            placeholder="Capture the key idea from this moment in the video. Ctrl/Cmd+Enter to save."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={suppressYoutubeShortcuts}
            onKeyUp={suppressYoutubeShortcuts}
          />
          <button style={styles.primaryButton} disabled={isSaving || !draft.trim()} onClick={() => void handleAddNote()}>
            Add note at {formatTimestampLabel(videoTime)}
          </button>
          {props.exportFeedback ? <p style={styles.feedback}>{props.exportFeedback}</p> : null}
          <div style={styles.list}>
            {noteCount === 0 ? (
              <p style={styles.emptyState}>No notes yet. Capture key moments as you watch.</p>
            ) : (
              [...(props.note?.items ?? [])].reverse().map((item) => (
                <button key={item.id} style={styles.noteItem} onClick={() => props.onSeekCue(item.timestampSec)}>
                  <span style={styles.noteTime}>{formatTimestampLabel(item.timestampSec)}</span>
                  <span>{item.text}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={styles.section}>
          <p style={styles.smallMeta}>
            {props.primaryTrackLabel ? `Primary track: ${props.primaryTrackLabel}` : 'Transcript unavailable for this video.'}
          </p>
          {props.transcript.status === 'loading' ? <p style={styles.emptyState}>Loading transcript…</p> : null}
          {props.transcript.status === 'error' ? (
            <div style={styles.errorBox}>
              <p style={styles.emptyState}>{props.transcript.error}</p>
              <button style={styles.retryButton} onClick={props.onRetryTranscript}>
                Retry
              </button>
            </div>
          ) : null}
          {props.transcript.status === 'empty' ? <p style={styles.emptyState}>Transcript unavailable for this video. Notes still work.</p> : null}
          {props.transcript.status === 'ready' ? (
            <div style={styles.list}>
              {props.transcript.cues.map((cue) => (
                <button key={`${cue.startSec}-${cue.text}`} style={styles.noteItem} onClick={() => props.onSeekCue(cue.startSec)}>
                  <span style={styles.noteTime}>{formatTimestampLabel(cue.startSec)}</span>
                  <span>{cue.text}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function createOverlayStyles(theme: ResolvedTheme): Record<string, CSSProperties> {
  const palette = getThemePalette(theme);
  return {
    backdrop: {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
      display: 'grid',
      placeItems: 'center',
      padding: '32px',
      background:
        theme === 'dark'
          ? 'radial-gradient(circle at top, rgba(45, 212, 191, 0.16), transparent 32%), rgba(2, 6, 23, 0.88)'
          : 'radial-gradient(circle at top, rgba(20, 184, 166, 0.16), transparent 32%), rgba(245, 251, 255, 0.82)',
      backdropFilter: 'blur(8px)',
    },
    card: {
      width: 'min(520px, calc(100vw - 32px))',
      padding: '28px',
      borderRadius: '24px',
      background: palette.surfaceBackground,
      border: `1px solid ${palette.border}`,
      color: palette.primaryText,
      boxShadow: palette.shadow,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      colorScheme: palette.colorScheme,
    },
    eyebrow: {
      margin: 0,
      color: palette.mutedText,
      fontSize: '12px',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    title: {
      margin: '10px 0 0',
      fontSize: '28px',
      lineHeight: 1.1,
    },
    body: {
      margin: '12px 0 0',
      lineHeight: 1.6,
      color: palette.secondaryText,
    },
    timer: {
      marginTop: '18px',
      padding: '12px 16px',
      borderRadius: '999px',
      display: 'inline-flex',
      background: palette.accentFillSoft,
      color: palette.accentText,
      fontWeight: 700,
    },
    actions: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '10px',
      marginTop: '18px',
    },
    primaryButton: {
      border: 'none',
      borderRadius: '14px',
      padding: '14px 16px',
      background: palette.accentGradient,
      color: palette.accentContrast,
      fontWeight: 700,
      cursor: 'pointer',
    },
    secondaryButton: {
      border: `1px solid ${palette.border}`,
      borderRadius: '14px',
      padding: '14px 16px',
      background: palette.ghostBackground,
      color: palette.secondaryText,
      fontWeight: 600,
      cursor: 'pointer',
    },
    ghostButton: {
      border: `1px solid ${palette.border}`,
      borderRadius: '14px',
      padding: '14px 16px',
      background: 'transparent',
      color: palette.secondaryText,
      fontWeight: 600,
      cursor: 'pointer',
    },
    error: {
      margin: '14px 0 0',
      color: palette.dangerText,
      lineHeight: 1.5,
    },
  };
}

function createPanelStyles(theme: ResolvedTheme): Record<string, CSSProperties> {
  const palette = getThemePalette(theme);
  return {
    shell: {
      marginTop: '8px',
      width: '100%',
      maxWidth: '400px',
      boxSizing: 'border-box',
      borderRadius: '24px',
      border: `1px solid ${palette.borderSoft}`,
      background: palette.surfaceBackground,
      color: palette.primaryText,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      boxShadow: palette.shadow,
      overflow: 'hidden',
      colorScheme: palette.colorScheme,
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '20px 20px 14px',
      alignItems: 'flex-start',
    },
    eyebrow: {
      margin: 0,
      color: palette.mutedText,
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    title: {
      margin: '6px 0 0',
      fontSize: '18px',
      lineHeight: 1.3,
    },
    exportButton: {
      border: `1px solid ${palette.border}`,
      borderRadius: '999px',
      padding: '10px 14px',
      background: palette.ghostBackground,
      color: palette.secondaryText,
      fontWeight: 600,
      cursor: 'pointer',
    },
    tabs: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
      padding: '0 20px 16px',
    },
    tab: {
      border: `1px solid ${palette.borderSoft}`,
      borderRadius: '999px',
      padding: '10px 12px',
      background: 'transparent',
      color: palette.mutedText,
      cursor: 'pointer',
    },
    activeTab: {
      border: 'none',
      borderRadius: '999px',
      padding: '10px 12px',
      background: palette.accentGradient,
      color: palette.accentContrast,
      fontWeight: 700,
      cursor: 'pointer',
    },
    section: {
      display: 'grid',
      gap: '12px',
      padding: '0 20px 20px',
    },
    textarea: {
      width: '100%',
      minHeight: '96px',
      boxSizing: 'border-box',
      resize: 'vertical',
      borderRadius: '16px',
      border: `1px solid ${palette.borderSoft}`,
      background: palette.panelMutedBackground,
      color: palette.primaryText,
      padding: '12px 14px',
    },
    primaryButton: {
      border: 'none',
      borderRadius: '14px',
      padding: '12px 14px',
      background: palette.accentGradient,
      color: palette.accentContrast,
      fontWeight: 700,
      cursor: 'pointer',
    },
    list: {
      display: 'grid',
      gap: '10px',
      maxHeight: '420px',
      overflow: 'auto',
      paddingRight: '4px',
    },
    noteItem: {
      display: 'grid',
      gap: '6px',
      textAlign: 'left',
      border: `1px solid ${palette.borderSoft}`,
      borderRadius: '16px',
      padding: '12px 14px',
      background: palette.panelMutedBackground,
      color: palette.primaryText,
      cursor: 'pointer',
    },
    noteTime: {
      color: palette.accentText,
      fontWeight: 700,
    },
    emptyState: {
      margin: 0,
      color: palette.secondaryText,
      lineHeight: 1.6,
    },
    errorBox: {
      display: 'grid',
      gap: '8px',
    },
    retryButton: {
      border: `1px solid ${palette.borderSoft}`,
      borderRadius: '12px',
      padding: '10px 12px',
      background: palette.ghostBackground,
      color: palette.secondaryText,
      cursor: 'pointer',
    },
    smallMeta: {
      margin: 0,
      color: palette.mutedText,
      fontSize: '13px',
    },
    feedback: {
      margin: 0,
      color: palette.successText,
      fontSize: '13px',
    },
  };
}

export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    const systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      if (state.settings.themePreference !== 'system') {
        return;
      }
      setState({
        resolvedTheme: resolveThemePreference('system', event.matches),
      });
    };

    installHistoryHooks();
    chrome.storage.onChanged.addListener(onStorageChanged);
    systemThemeMedia.addEventListener('change', handleSystemThemeChange);
    document.addEventListener('yt-navigate-finish', maybeHandleUrlChange as EventListener);
    document.addEventListener('yt-page-data-updated', maybeHandleUrlChange as EventListener);
    window.addEventListener('popstate', maybeHandleUrlChange);

    const observer = new MutationObserver(() => {
      if (shouldShowPanel()) {
        ensurePanelRoot();
        if (panelRoot) {
          renderPanel();
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setInterval(() => {
      maybeHandleUrlChange();
      state.now = Date.now();
      if (getSessionPhase(state.session, state.now) === 'expired' && state.session?.status === 'active') {
        void refreshPageState({ syncSession: true });
        return;
      }
      renderAll();
    }, 1_000);

    void refreshPageState({ syncSession: true, syncSettings: true });
  },
});
