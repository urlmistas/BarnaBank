import { useEffect, useRef, useState } from 'react'
import { EDGE_PX, PULL_THRESHOLD, isBackSwipe, isPullStart, pullDistance, type TouchPoint } from '@/lib/gestures'

/** não interfere em campos de texto nem com uma janela (dialog) aberta */
function blocked(target: EventTarget | null): boolean {
  if (document.querySelector('dialog[open]')) return true
  const el = target instanceof Element ? target : null
  return !!el?.closest('input, textarea, select, [contenteditable="true"], [data-no-gesture]')
}

/**
 * Gestos de toque: arrastar da borda esquerda = voltar; puxar para baixo no topo da página = atualizar.
 * Devolve o quanto o indicador deve descer (`pull`) e se está atualizando.
 */
export function useGestures({
  enabled,
  canGoBack,
  onBack,
  onRefresh,
}: {
  enabled: boolean
  canGoBack: () => boolean
  onBack: () => void
  onRefresh: () => Promise<void> | void
}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const fns = useRef({ canGoBack, onBack, onRefresh })
  useEffect(() => {
    fns.current = { canGoBack, onBack, onRefresh }
  })
  const busy = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let start: TouchPoint | null = null
    let pulling = false
    let last = 0

    const reset = () => {
      start = null
      pulling = false
      last = 0
      setPull(0)
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || blocked(e.target)) return reset()
      const t = e.touches[0]
      start = { x: t.clientX, y: t.clientY, t: Date.now() }
      pulling = false
    }
    const onMove = (e: TouchEvent) => {
      if (!start || busy.current || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      if (start.x <= EDGE_PX) return // começou na borda: é o gesto de voltar
      if (!pulling && window.scrollY <= 0 && isPullStart(dx, dy)) pulling = true
      if (pulling) {
        if (window.scrollY > 0 || dy <= 0) return reset()
        last = pullDistance(dy)
        setPull(last)
      }
    }
    const onEnd = (e: TouchEvent) => {
      const s = start
      const wasPulling = pulling
      const dist = last
      reset()
      if (!s || busy.current) return
      const t = e.changedTouches[0]
      if (t && isBackSwipe(s, { x: t.clientX, y: t.clientY, t: Date.now() })) {
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
      }
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

  return { pull, refreshing }
}
