import { describe, expect, it } from 'vitest';

import { buildPopupStatus } from './App';
import type { RouteInfo } from '../../src/shared/routes';

describe('buildPopupStatus', () => {
  const watchRoute: RouteInfo = {
    kind: 'watch',
    allowedDuringSession: true,
    label: 'Watch page',
  };

  const homeRoute: RouteInfo = {
    kind: 'home',
    allowedDuringSession: false,
    label: 'Home feed',
  };

  const resultsRoute: RouteInfo = {
    kind: 'results',
    allowedDuringSession: true,
    label: 'Search results',
  };

  it('explains why watch pages stay open during active sessions', () => {
    expect(buildPopupStatus(watchRoute, 'active')).toEqual({
      title: 'Study happens on this watch page.',
      description:
        'This page stays open so you can watch, read the transcript, and add timestamped notes from the Study panel beside the video.',
      showWatchGuide: true,
    });
  });

  it('explains that blocked routes will lock during active sessions', () => {
    expect(buildPopupStatus(homeRoute, 'active')).toEqual({
      title: 'Home feed will lock during the session.',
      description:
        'This route is treated as a distraction surface. Use Break to pause and unlock YouTube temporarily, or open search to find a video directly.',
      showWatchGuide: false,
    });
  });

  it('shows paused session guidance', () => {
    expect(buildPopupStatus(watchRoute, 'paused')).toEqual({
      title: 'Study Mode is paused.',
      description:
        'YouTube is unlocked until you resume the session. Resume when you want blocking and the study panel back.',
      showWatchGuide: true,
    });
  });

  it('shows expired and results guidance', () => {
    expect(buildPopupStatus(watchRoute, 'expired').title).toBe('The last study session finished.');
    expect(buildPopupStatus(resultsRoute, 'active').title).toBe('Search stays available during Study Mode.');
  });
});
