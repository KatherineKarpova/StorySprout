/**
 * Theme catalog. StorySprout ships one theme, `meadow` (src/themes.css).
 * Color values live in themes.css — this file is metadata only.
 */

export const THEMES = [
  {
    id: 'meadow',
    label: 'Meadow',
    description: 'Warm storybook paper with sprout green and coral.',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

/** Read the currently active theme id from <html data-theme>. */
export function getActiveTheme(): ThemeId {
  if (typeof document === 'undefined') return 'meadow'
  const id = document.documentElement.getAttribute('data-theme') as ThemeId | null
  return id ?? 'meadow'
}

/** Look up a theme entry by id, or fall back to the first theme. */
export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
