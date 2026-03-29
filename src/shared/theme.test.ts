import { describe, expect, it } from 'vitest';

import { resolveThemePreference, validateCustomMinutesInput } from './theme';

describe('theme helpers', () => {
  it('resolves system preference to dark or light', () => {
    expect(resolveThemePreference('system', true)).toBe('dark');
    expect(resolveThemePreference('system', false)).toBe('light');
    expect(resolveThemePreference('light', true)).toBe('light');
    expect(resolveThemePreference('dark', false)).toBe('dark');
  });

  it('validates custom minutes without throwing', () => {
    expect(validateCustomMinutesInput('')).toEqual({
      value: null,
      error: null,
    });
    expect(validateCustomMinutesInput('abc')).toEqual({
      value: null,
      error: 'Use a whole number between 5 and 240.',
    });
    expect(validateCustomMinutesInput('3')).toEqual({
      value: null,
      error: 'Custom sessions must be between 5 and 240 minutes.',
    });
    expect(validateCustomMinutesInput('45')).toEqual({
      value: 45,
      error: null,
    });
  });
});
