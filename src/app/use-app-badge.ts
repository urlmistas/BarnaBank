import { useEffect } from 'react'

type Badging = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }

/** número de vencimentos atrasados no ícone do app instalado (iPhone com o app na tela inicial, Android, desktop); 0 limpa */
export function useAppBadge(count: number) {
  useEffect(() => {
    const nav = navigator as Badging
    if (typeof nav.setAppBadge !== 'function') return
    const p = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.()
    p?.catch(() => {
      /* sem permissão de notificação, o navegador recusa: o selo é só um extra */
    })
  }, [count])
}
