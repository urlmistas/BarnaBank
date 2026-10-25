import { useEffect, useRef } from 'react'
import { CHORD_MS, readShortcutsOn, resolveKey, type ShortcutAction } from '@/lib/shortcuts'

// Atalhos de teclado (lista e regras em lib/shortcuts.ts): Ctrl/⌘ + K ou "/" abrem a busca, "G" e uma letra trocam de tela.
// Esc fecha as janelas (o <dialog> já faz isso sozinho). Teclas simples só valem fora de campos de texto e sem janela aberta.
export function useShortcuts(run: (action: ShortcutAction) => void) {
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })
  useEffect(() => {
    let chord = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const reset = () => {
      chord = false
      clearTimeout(timer)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return
      const t = e.target as HTMLElement | null
      const r = resolveKey(
        {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          alt: e.altKey,
          typing: !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable),
          dialogOpen: !!document.querySelector('dialog[open]'),
        },
        chord,
        readShortcutsOn(),
      )
      reset()
      if (!r.handled) return
      e.preventDefault()
      if (r.chord) {
        chord = true
        timer = setTimeout(reset, CHORD_MS)
      } else if (r.action) runRef.current(r.action)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      reset()
    }
  }, [])
}
