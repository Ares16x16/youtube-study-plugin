import { describe, expect, it } from 'vitest';

import { getRouteInfo, getVideoId } from './routes';

describe('routes', () => {
  it('allows watch and results routes during a session', () => {
    expect(getRouteInfo('https://www.youtube.com/watch?v=abc').allowedDuringSession).toBe(true);
    expect(getRouteInfo('https://www.youtube.com/results?search_query=test').allowedDuringSession).toBe(true);
  });

  it('blocks home and shorts by default', () => {
    expect(getRouteInfo('https://www.youtube.com/').allowedDuringSession).toBe(false);
    expect(getRouteInfo('https://www.youtube.com/shorts/123').allowedDuringSession).toBe(false);
  });

  it('extracts the current video id', () => {
    expect(getVideoId('https://www.youtube.com/watch?v=study123&list=xyz')).toBe('study123');
  });
});
