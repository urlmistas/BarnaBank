import { useCallback, useEffect, useState } from 'react'

// "Instalar o app" (PWA). O Chrome/Edge disparam `beforeinstallprompt`; no iPhone não há evento, só "Adicionar à tela inicial".

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** já está aberto como app instalado? */
export function isStandalone(win: Pick<Window, 'matchMedia'> & { navigator: Navigator } = globalThis.window): boolean {
  if (!win) return false
  try {
    return win.matchMedia?.('(display-mode: standalone)').matches || (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

export function useInstall() {
  const [ev, setEv] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEv(e as InstallEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setEv(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = useCallback(async () => {
    if (!ev) return
    await ev.prompt()
    const { outcome } = await ev.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setEv(null)
  }, [ev])

  return { canInstall: !!ev && !installed, installed, install }
}
