import { describe, expect, it } from 'vitest';

import { SESSION_SCOPE } from './constants';
import { coerceActiveSession, coerceStudySettings, coerceVideoNote } from './storage';

describe('storage coercion', () => {
  it('normalizes settings with defaults', () => {
    const settings = coerceStudySettings({ defaultSessionMinutes: 45, presets: [25, 45] });
    expect(settings.defaultSessionMinutes).toBe(45);
    expect(settings.hideComments).toBe(true);
  });

  it('accepts valid active sessions', () => {
    const session = coerceActiveSession({
      id: 'session-abc',
      status: 'active',
      startedAt: 100,
      endsAt: 200,
      durationMinutes: 25,
      scope: SESSION_SCOPE,
    });
    expect(session?.scope).toBe(SESSION_SCOPE);
  });

  it('drops malformed note items', () => {
    const note = coerceVideoNote({
      videoId: 'abc',
      title: 'Test',
      url: 'https://www.youtube.com/watch?v=abc',
      updatedAt: 10,
      items: [{ id: '1', text: 'Kept', timestampSec: 12, createdAt: 1 }, { text: 'Dropped' }],
    });

    expect(note?.items).toHaveLength(1);
  });
});
