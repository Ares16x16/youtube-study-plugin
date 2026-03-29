import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

import type { PlayerBootstrapData, TranscriptTrack } from '../src/shared/types';

declare global {
  interface Window {
    ytInitialPlayerResponse?: {
      videoDetails?: {
        title?: string;
        videoId?: string;
      };
      captions?: {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: Array<{
            baseUrl: string;
            languageCode: string;
            name?: { runs?: Array<{ text?: string }> };
            kind?: string;
            vssId?: string;
          }>;
          defaultAudioTrackIndex?: number;
        };
      };
    };
    movie_player?: {
      getPlayerResponse?: () => Window['ytInitialPlayerResponse'];
    };
  }
}

function readTrackLabel(track: { name?: { runs?: Array<{ text?: string }> }; languageCode: string }): string {
  const label = track.name?.runs?.map((run) => run.text?.trim()).filter(Boolean).join(' ');
  return label || track.languageCode;
}

function extractTracks(response: NonNullable<Window['ytInitialPlayerResponse']>): TranscriptTrack[] {
  const trackList = response.captions?.playerCaptionsTracklistRenderer;
  const defaultIndex = trackList?.defaultAudioTrackIndex ?? 0;
  const tracks = trackList?.captionTracks ?? [];

  return tracks.map((track, index) => ({
    id: track.vssId ?? `${track.languageCode}-${index}`,
    languageCode: track.languageCode,
    label: readTrackLabel(track),
    kind: track.kind,
    isDefault: index === defaultIndex,
    trackUrl: track.baseUrl,
  }));
}

function extractPlayerData(): PlayerBootstrapData | null {
  const response = window.movie_player?.getPlayerResponse?.() ?? window.ytInitialPlayerResponse;
  if (!response?.videoDetails?.videoId) {
    return null;
  }

  return {
    title: response.videoDetails.title ?? 'YouTube video',
    videoId: response.videoDetails.videoId,
    tracks: extractTracks(response),
  };
}

export default defineUnlistedScript(() => {
  document.addEventListener('yt-study-mode:get-player-data', () => {
    const detail = extractPlayerData();
    document.dispatchEvent(new CustomEvent('yt-study-mode:player-data', { detail }));
  });
});
