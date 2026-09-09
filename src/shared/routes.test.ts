import { describe, expect, it } from 'vitest';

import { getRouteInfo, getVideoId, isYouTubeHost } from './routes';

describe('routes', () => {
  it('allows watch and results routes during a session', () => {
    expect(getRouteInfo('https://www.youtube.com/watch?v=abc').allowedDuringSession).toBe(true);
    expect(getRouteInfo('https://www.youtube.com/results?search_query=test').allowedDuringSession).toBe(true);
  });

  it('blocks home, trending, shorts, and library by default', () => {
    expect(getRouteInfo('https://www.youtube.com/').allowedDuringSession).toBe(false);
    expect(getRouteInfo('https://www.youtube.com/feed/trending').kind).toBe('home');
    expect(getRouteInfo('https://www.youtube.com/shorts/123').allowedDuringSession).toBe(false);
    expect(getRouteInfo('https://www.youtube.com/feed/library').kind).toBe('history');
  });

  it('honors block setting overrides', () => {
    expect(
      getRouteInfo('https://www.youtube.com/', {
        blockHome: false,
        blockShorts: true,
        blockSubscriptions: true,
        blockChannels: true,
        blockPlaylists: true,
      }).allowedDuringSession,
    ).toBe(true);
  });

  it('extracts the current video id from watch and shorts urls', () => {
    expect(getVideoId('https://www.youtube.com/watch?v=study123&list=xyz')).toBe('study123');
    expect(getVideoId('https://www.youtube.com/shorts/short123')).toBe('short123');
  });

  it('recognizes YouTube hosts', () => {
    expect(isYouTubeHost('www.youtube.com')).toBe(true);
    expect(isYouTubeHost('m.youtube.com')).toBe(true);
    expect(isYouTubeHost('example.com')).toBe(false);
  });
});
