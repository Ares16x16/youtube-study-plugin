import { describe, expect, it } from 'vitest';

import { SESSION_SCOPE } from './constants';
import { coerceActiveSession, coerceSessionHistory, coerceStudySettings, coerceVideoNote } from './storage';

describe('storage coercion', () => {
  it('normalizes settings with defaults and clamps minutes', () => {
    const settings = coerceStudySettings({
      defaultSessionMinutes: 999,
      presets: [25, 45, 25, 'nope' as unknown as number],
      hideComments: 'yes' as unknown as boolean,
      themePreference: 'neon' as never,
    });
    expect(settings.defaultSessionMinutes).toBe(240);
    expect(settings.presets).toEqual([25, 45]);
    expect(settings.hideComments).toBe(true);
    expect(settings.themePreference).toBe('system');
  });

  it('accepts valid active and paused sessions', () => {
    const session = coerceActiveSession({
      id: 'session-abc',
      status: 'paused',
      startedAt: 100,
      endsAt: 200,
      durationMinutes: 25,
      remainingMs: 50,
      scope: SESSION_SCOPE,
    });
    expect(session?.scope).toBe(SESSION_SCOPE);
    expect(session?.remainingMs).toBe(50);
  });

  it('drops malformed note items and empty text', () => {
    const note = coerceVideoNote({
      videoId: 'abc',
      title: 'Test',
      url: 'https://www.youtube.com/watch?v=abc',
      updatedAt: 10,
      items: [
        { id: '1', text: 'Kept', timestampSec: 12, createdAt: 1 },
        { text: 'Dropped' },
        { id: '2', text: '   ', timestampSec: 1, createdAt: 2 },
      ],
    });
    expect(note?.items).toHaveLength(1);
  });

  it('coerces session history payloads', () => {
    const history = coerceSessionHistory({
      sessionId: 's1',
      startedAt: 10,
      endedAt: null,
      videos: [
        {
          videoId: 'abc',
          title: 'Tracked',
          url: 'https://www.youtube.com/watch?v=abc',
          firstSeenAt: 10,
          lastSeenAt: 20,
          notes: [],
        },
      ],
    });
    expect(history?.videos).toHaveLength(1);
    expect(history?.endedAt).toBeNull();
  });
});
