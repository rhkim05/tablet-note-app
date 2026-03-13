import { useSettingsStore } from '../store/useSettingsStore';

export const lightTheme = {
  bg:             '#F5F5F0',
  surface:        '#FFFFFF',
  surfaceAlt:     '#F8F8F6',
  border:         '#E0E0D8',
  text:           '#1A1A1A',
  textSub:        '#555555',
  textHint:       '#AAAAAA',
  accent:         '#4A90E2',
  destructive:    '#E8402A',
  destructiveBg:  '#FFF2F0',
  overlay:        'rgba(0,0,0,0.45)',
};

export const darkTheme = {
  bg:             '#1A1A1A',
  surface:        '#2C2C2C',
  surfaceAlt:     '#252525',
  border:         '#3A3A3A',
  text:           '#FFFFFF',
  textSub:        '#AAAAAA',
  textHint:       '#666666',
  accent:         '#4A90E2',
  destructive:    '#FF6B5B',
  destructiveBg:  '#3A1A18',
  overlay:        'rgba(0,0,0,0.70)',
};

export type Theme = typeof lightTheme;

export function useTheme(): Theme {
  const isDarkMode = useSettingsStore(s => s.isDarkMode);
  return isDarkMode ? darkTheme : lightTheme;
}
