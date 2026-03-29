import type { StudySettings } from './types';

export type YouTubeRouteKind =
  | 'watch'
  | 'results'
  | 'home'
  | 'shorts'
  | 'subscriptions'
  | 'channel'
  | 'playlist'
  | 'history'
  | 'other';

export interface RouteInfo {
  kind: YouTubeRouteKind;
  allowedDuringSession: boolean;
  label: string;
}

export function getRouteInfo(
  urlLike: string | URL,
  settings?: Pick<
    StudySettings,
    'blockChannels' | 'blockHome' | 'blockPlaylists' | 'blockShorts' | 'blockSubscriptions'
  >,
): RouteInfo {
  const url = typeof urlLike === 'string' ? new URL(urlLike) : urlLike;
  const path = url.pathname;

  if (path === '/watch') {
    return { kind: 'watch', allowedDuringSession: true, label: 'Watch page' };
  }
  if (path === '/results') {
    return { kind: 'results', allowedDuringSession: true, label: 'Search results' };
  }
  if (path === '/' || path === '/feed/explore') {
    return {
      kind: 'home',
      allowedDuringSession: !(settings?.blockHome ?? true),
      label: 'Home feed',
    };
  }
  if (path.startsWith('/shorts')) {
    return {
      kind: 'shorts',
      allowedDuringSession: !(settings?.blockShorts ?? true),
      label: 'Shorts',
    };
  }
  if (path === '/feed/subscriptions') {
    return {
      kind: 'subscriptions',
      allowedDuringSession: !(settings?.blockSubscriptions ?? true),
      label: 'Subscriptions',
    };
  }
  if (path === '/playlist') {
    return {
      kind: 'playlist',
      allowedDuringSession: !(settings?.blockPlaylists ?? true),
      label: 'Playlist',
    };
  }
  if (path === '/feed/history') {
    return {
      kind: 'history',
      allowedDuringSession: false,
      label: 'History',
    };
  }
  if (
    path.startsWith('/@') ||
    path.startsWith('/channel/') ||
    path.startsWith('/c/') ||
    path.startsWith('/user/')
  ) {
    return {
      kind: 'channel',
      allowedDuringSession: !(settings?.blockChannels ?? true),
      label: 'Channel',
    };
  }
  return { kind: 'other', allowedDuringSession: false, label: 'YouTube page' };
}

export function getVideoId(urlLike: string | URL): string | null {
  const url = typeof urlLike === 'string' ? new URL(urlLike) : urlLike;
  return url.searchParams.get('v');
}
