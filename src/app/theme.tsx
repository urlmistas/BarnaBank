import { useSyncExternalStore } from 'react'

// Preferência de tema do app NOVO (chave própria; não mexe nas chaves do app antigo).
// 'system' segue o sistema (prefers-color-scheme). Sem nada gravado = escuro (padrão do app).
const THEME_KEY = 'bbweb_theme'
export type Theme = 'dark' | 'light'
export type ThemePref = Theme | 'system'
export const THEME_PREFS: ThemePref[] = ['system', 'light', 'dark']

const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'system' || v === 'dark' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

export function resolveTheme(pref: ThemePref, systemDark: boolean): Theme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

let pref: ThemePref = typeof window === 'undefined' ? 'dark' : readPref()
const listeners = new Set<() => void>()

function apply() {
  const t = resolveTheme(pref, mq().matches)
  document.documentElement.classList.toggle('dark', t === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0d0e10' : '#f7f7f5')
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  const m = mq()
  const onSystem = () => pref === 'system' && apply()
  // outra aba mudou o tema → acompanha
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY && e.key !== null) return
    pref = readPref()
    apply()
  }
  m.addEventListener('change', onSystem)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(cb)
    m.removeEventListener('change', onSystem)
    window.removeEventListener('storage', onStorage)
  }
}

function setPref(p: ThemePref) {
  pref = p
  try {
    localStorage.setItem(THEME_KEY, p)
  } catch {
    /* navegador sem storage: só não lembra */
  }
  apply()
}

const snapshot = () => pref + ':' + (document.documentElement.classList.contains('dark') ? 'dark' : 'light')

export function useTheme() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => 'dark:dark')
  const [p, t] = snap.split(':') as [ThemePref, Theme]
  return {
    /** tema aplicado agora */
    theme: t,
    /** escolha gravada (inclui 'system') */
    pref: p,
    setPref,
    /** botão do cabeçalho: alterna para o oposto do que está na tela */
    toggle: () => setPref(t === 'dark' ? 'light' : 'dark'),
  }
}
