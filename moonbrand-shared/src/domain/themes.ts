import { createId } from '../lib/id';
import type { Theme, ThemeLevel } from './brand';
import { THEME_COLORS } from './catalog';

export const MAX_THEMES = 6;

export const THEME_LEVELS: { value: ThemeLevel; label: string }[] = [
  { value: 'often', label: 'Spesso' },
  { value: 'sometimes', label: 'Ogni tanto' },
  { value: 'rarely', label: 'Di rado' },
];

const LEVEL_SHARE: Record<ThemeLevel, number> = { often: 3, sometimes: 2, rarely: 1 };

export function totalWeight(themes: readonly Theme[]): number {
  return themes.reduce((sum, theme) => sum + theme.weight, 0);
}

export function themeLevel(theme: Theme): ThemeLevel {
  if (theme.level) return theme.level;
  return theme.weight >= 30 ? 'often' : theme.weight >= 15 ? 'sometimes' : 'rarely';
}

export function themeLevelLabel(theme: Theme): string {
  const level = themeLevel(theme);
  return THEME_LEVELS.find((option) => option.value === level)?.label ?? '';
}

export function withLevelWeights(themes: readonly Theme[]): Theme[] {
  if (themes.length === 0) return [];
  const shares = themes.map((theme) => LEVEL_SHARE[themeLevel(theme)]);
  const sum = shares.reduce((total, share) => total + share, 0);
  const exact = shares.map((share) => (share / sum) * 100);
  const weights = exact.map(Math.floor);
  const missing = 100 - weights.reduce((total, weight) => total + weight, 0);
  exact
    .map((value, i) => ({ i, rest: value - weights[i] }))
    .sort((x, y) => y.rest - x.rest || x.i - y.i)
    .slice(0, missing)
    .forEach(({ i }) => (weights[i] += 1));
  return themes.map((theme, i) => ({ ...theme, level: themeLevel(theme), weight: weights[i] }));
}

export function setThemeLevel(themes: readonly Theme[], index: number, level: ThemeLevel): Theme[] {
  return withLevelWeights(themes.map((theme, i) => (i === index ? { ...theme, level } : theme)));
}

function levelByPosition(index: number, count: number): ThemeLevel {
  if (index === 0) return 'often';
  return count >= 3 && index === count - 1 ? 'rarely' : 'sometimes';
}

function nextColor(themes: readonly Theme[]): string {
  const used = new Set(themes.map((theme) => theme.color));
  return THEME_COLORS.find((color) => !used.has(color)) ?? THEME_COLORS[themes.length % THEME_COLORS.length];
}

export function createThemes(names: readonly string[]): Theme[] {
  const list = names.slice(0, MAX_THEMES);
  const themes: Theme[] = [];
  list.forEach((name, i) => {
    themes.push({ id: createId('theme'), name, weight: 0, level: levelByPosition(i, list.length), color: nextColor(themes) });
  });
  return withLevelWeights(themes);
}

export function addTheme(themes: readonly Theme[], name = ''): Theme[] {
  if (themes.length >= MAX_THEMES) return [...themes];
  if (themes.length === 0) return createThemes([name]);
  return withLevelWeights([...themes, { id: createId('theme'), name, weight: 0, level: 'sometimes', color: nextColor(themes) }]);
}

export function removeTheme(themes: readonly Theme[], index: number): Theme[] {
  return withLevelWeights(themes.filter((_, i) => i !== index));
}
