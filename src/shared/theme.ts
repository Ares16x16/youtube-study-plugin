import { MAX_CUSTOM_MINUTES, MIN_CUSTOM_MINUTES } from './constants';
import type { ResolvedTheme, ThemePreference } from './types';

export interface ThemePalette {
  colorScheme: ResolvedTheme;
  appBackground: string;
  appBackgroundAccent: string;
  panelBackground: string;
  panelMutedBackground: string;
  surfaceBackground: string;
  surfaceStrongBackground: string;
  border: string;
  borderSoft: string;
  primaryText: string;
  secondaryText: string;
  mutedText: string;
  accentText: string;
  accentFill: string;
  accentFillSoft: string;
  accentGradient: string;
  accentContrast: string;
  ghostBackground: string;
  dangerBackground: string;
  dangerText: string;
  successText: string;
  shadow: string;
}

export function getSystemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark = getSystemPrefersDark(),
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return preference;
}

export function getThemePalette(theme: ResolvedTheme): ThemePalette {
  if (theme === 'light') {
    return {
      colorScheme: 'light',
      appBackground: 'linear-gradient(180deg, #f5fbff, #ebf3f8 78%)',
      appBackgroundAccent: 'radial-gradient(circle at top, rgba(13, 148, 136, 0.14), transparent 44%)',
      panelBackground: 'rgba(255, 255, 255, 0.92)',
      panelMutedBackground: 'rgba(240, 247, 251, 0.92)',
      surfaceBackground: 'rgba(255, 255, 255, 0.9)',
      surfaceStrongBackground: 'rgba(233, 243, 248, 0.95)',
      border: 'rgba(15, 23, 42, 0.12)',
      borderSoft: 'rgba(15, 23, 42, 0.08)',
      primaryText: '#0f172a',
      secondaryText: '#334155',
      mutedText: '#547081',
      accentText: '#0f766e',
      accentFill: '#14b8a6',
      accentFillSoft: 'rgba(20, 184, 166, 0.12)',
      accentGradient: 'linear-gradient(135deg, #14b8a6, #5eead4)',
      accentContrast: '#f8fffe',
      ghostBackground: 'rgba(255, 255, 255, 0.78)',
      dangerBackground: 'rgba(127, 29, 29, 0.12)',
      dangerText: '#991b1b',
      successText: '#0f766e',
      shadow: '0 20px 35px rgba(15, 23, 42, 0.12)',
    };
  }

  return {
    colorScheme: 'dark',
    appBackground: 'linear-gradient(180deg, #09111a, #04070b 78%)',
    appBackgroundAccent: 'radial-gradient(circle at top, rgba(20, 184, 166, 0.18), transparent 44%)',
    panelBackground: 'rgba(8, 15, 24, 0.78)',
    panelMutedBackground: 'rgba(15, 23, 42, 0.6)',
    surfaceBackground: 'rgba(7, 15, 22, 0.97)',
    surfaceStrongBackground: 'rgba(15, 23, 42, 0.72)',
    border: 'rgba(148, 163, 184, 0.18)',
    borderSoft: 'rgba(148, 163, 184, 0.16)',
    primaryText: '#e6eef5',
    secondaryText: '#d7e2e9',
    mutedText: '#8eb8c5',
    accentText: '#97f8ea',
    accentFill: '#2dd4bf',
    accentFillSoft: 'rgba(13, 148, 136, 0.18)',
    accentGradient: 'linear-gradient(135deg, #2dd4bf, #99f6e4)',
    accentContrast: '#041016',
    ghostBackground: 'rgba(15, 23, 42, 0.72)',
    dangerBackground: 'rgba(127, 29, 29, 0.82)',
    dangerText: '#fee2e2',
    successText: '#95f7ea',
    shadow: '0 20px 35px rgba(0, 0, 0, 0.22)',
  };
}

export interface CustomMinutesValidation {
  value: number | null;
  error: string | null;
}

export function validateCustomMinutesInput(input: string): CustomMinutesValidation {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: null, error: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return {
      value: null,
      error: `Use a whole number between ${MIN_CUSTOM_MINUTES} and ${MAX_CUSTOM_MINUTES}.`,
    };
  }

  if (parsed < MIN_CUSTOM_MINUTES || parsed > MAX_CUSTOM_MINUTES) {
    return {
      value: null,
      error: `Custom sessions must be between ${MIN_CUSTOM_MINUTES} and ${MAX_CUSTOM_MINUTES} minutes.`,
    };
  }

  return { value: parsed, error: null };
}
