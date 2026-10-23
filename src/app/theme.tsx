import { useCallback, useState } from 'react'

// Preferência de tema do app NOVO (chave própria; não mexe nas chaves do app antigo).
const THEME_KEY = 'bbweb_theme'
export type Theme = 'dark' | 'light'

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(current)
  const setTheme = useCallback((t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0d0e10' : '#f7f7f5')
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* navegador sem storage: só não lembra */
    }
    setThemeState(t)
  }, [])
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
