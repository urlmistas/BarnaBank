import { useEffect, useRef, useState } from 'react'
import {
  EDGE_PX, PULL_THRESHOLD, backFollow, inHorizontalScroll, isBackDrag, isPullStart, pullDistance, tabSwipe, type TouchPoint,
} from '@/lib/gestures'

/** não interfere em campos de texto, em áreas marcadas, nem com uma janela (dialog) aberta */
function blocked(target: EventTarget | null): boolean {
  if (document.querySelector('dialog[open]')) return true
  const el = target instanceof Element ? target : null
  return !!el?.closest('input, textarea, select, [contenteditable="true"], [data-no-gesture]')
}

/**
 * Gestos de toque do app instalado:
 *  - arrastar da borda esquerda = voltar (a tela acompanha o dedo; `edge` é o quanto ela andou);
 *  - arrastão rápido para o lado = trocar de aba (se `canTab` e `tabsEnabled`);
 *  - puxar para baixo no topo da página = atualizar (`pull` é o quanto o indicador desceu).
 */
export function useGestures({
  enabled,
  canGoBack,
  onBack,
  onRefresh,
  canTab,
  tabsEnabled,
  onTab,
}: {
  enabled: boolean
  canGoBack: () => boolean
  onBack: () => void
  onRefresh: () => Promise<void> | void
  canTab?: () => boolean
  tabsEnabled?: () => boolean
  onTab?: (dir: -1 | 1) => void
}) {
  const [pull, setPull] = useState(0)
  const [edge, setEdge] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const fns = useRef({ canGoBack, onBack, onRefresh, canTab, tabsEnabled, onTab })
  useEffect(() => {
    fns.current = { canGoBack, onBack, onRefresh, canTab, tabsEnabled, onTab }
  })
  const busy = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let start: TouchPoint | null = null
    let startEl: Element | null = null
    let pulling = false
    let last = 0

    const reset = () => {
      start = null
      startEl = null
      pulling = false
      last = 0
      setPull(0)
      setEdge(0)
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e.target)) return reset()
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
      startEl = e.target instanceof Element ? e.target : null
      pulling = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start || busy.current || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (start.x <= EDGE_PX) {
        // começou na borda: é o gesto de voltar; a tela acompanha o dedo (só se há para onde voltar)
        if (dx > 0 && Math.abs(dy) < dx && fns.current.canGoBack()) setEdge(backFollow(dx))
        return
      }
      if (!pulling && window.scrollY <= 0 && isPullStart(dx, dy)) pulling = true
      if (pulling) {
        if (window.scrollY > 0 || dy <= 0) return reset()
        last = pullDistance(dy)
        setPull(last)
      }
    }
    const onEnd = (e: TouchEvent) => {
      const s = start
      const el = startEl
      const wasPulling = pulling
      const dist = last
      reset()
      if (!s || busy.current) return
      const t = e.changedTouches[0]
      if (!t) return
      const end = { x: t.clientX, y: t.clientY, t: Date.now() }
      if (isBackDrag(s, end)) {
        if (fns.current.canGoBack()) fns.current.onBack()
        return
      }
      if (wasPulling && dist >= PULL_THRESHOLD) {
        busy.current = true
        setRefreshing(true)
        void Promise.resolve(fns.current.onRefresh()).finally(() => {
          busy.current = false
          setRefreshing(false)
        })
        return
      }
      const dir = tabSwipe(s, end)
      const f = fns.current
      // cards que se deslizam (data-no-tab-swipe) e áreas que rolam para o lado ficam com o próprio arrasto
      if (dir && f.onTab && f.canTab?.() && (f.tabsEnabled?.() ?? true) && !inHorizontalScroll(el) && !el?.closest('[data-no-tab-swipe]')) f.onTab(dir)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [enabled])

  return { pull, edge, refreshing }
}
