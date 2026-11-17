import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F0E6',
  surface: '#FFFCF7',
  text: '#2A1A12',
  textMuted: '#7A6558',
  border: '#E6D9C8',
  primary: '#C45C26',
  primaryText: '#FFFCF7',
  danger: '#C2413B',
  success: '#3E7C59',
  badge: '#F0E0D0',
  badgeText: '#8B3E1A',
  accent: '#3E7C59',
  splash: '#C45C26',
};

export type Theme = typeof light;

const dark: Theme = {
  background: '#1A120C',
  surface: '#2A1E16',
  text: '#F6EDE3',
  textMuted: '#B39A86',
  border: '#3D2E24',
  primary: '#E07A3D',
  primaryText: '#1A120C',
  danger: '#E5736A',
  success: '#6FBF8A',
  badge: '#3D2A1C',
  badgeText: '#F0C4A0',
  accent: '#6FBF8A',
  splash: '#C45C26',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
