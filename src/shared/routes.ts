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

export type RouteBlockSettings = Pick<
  StudySettings,
  'blockChannels' | 'blockHome' | 'blockPlaylists' | 'blockShorts' | 'blockSubscriptions'
>;

export function getRouteInfo(
  urlLike: string | URL,
  settings?: RouteBlockSettings,
): RouteInfo {
  const url = typeof urlLike === 'string' ? new URL(urlLike) : urlLike;
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/watch') {
    return { kind: 'watch', allowedDuringSession: true, label: 'Watch page' };
  }
  if (path === '/results') {
    return { kind: 'results', allowedDuringSession: true, label: 'Search results' };
  }
  if (
    path === '/'
    || path === '/feed/explore'
    || path === '/feed/trending'
    || path === '/gaming'
    || path === '/feed/storefront'
  ) {
    return {
      kind: 'home',
      allowedDuringSession: !(settings?.blockHome ?? true),
      label: path === '/feed/trending' ? 'Trending' : path === '/gaming' ? 'Gaming' : 'Home feed',
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
  if (path === '/playlist' || path.startsWith('/playlist')) {
    return {
      kind: 'playlist',
      allowedDuringSession: !(settings?.blockPlaylists ?? true),
      label: 'Playlist',
    };
  }
  if (path === '/feed/history' || path === '/feed/library') {
    return {
      kind: 'history',
      allowedDuringSession: false,
      label: path === '/feed/library' ? 'Library' : 'History',
    };
  }
  if (
    path.startsWith('/@')
    || path.startsWith('/channel/')
    || path.startsWith('/c/')
    || path.startsWith('/user/')
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
  if (url.pathname === '/watch') {
    return url.searchParams.get('v');
  }
  const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
  return shortsMatch?.[1] ?? null;
}

export function isYouTubeHost(hostname: string): boolean {
  return hostname === 'www.youtube.com' || hostname === 'youtube.com' || hostname === 'm.youtube.com';
}
