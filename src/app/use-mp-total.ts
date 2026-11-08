import { useEffect, useState } from 'react'
import { BOT_URL } from '@/lib/sync/telegram-link'
import { mpView } from '@/lib/sync/mpconta'
import { useAppData } from './data-context'

/** total do painel do Mercado Pago (conta + porquinhos), ou null se a integração não está configurada ou o bot não respondeu */
export function useMpTotal(): number | null {
  const { cloud, botToken } = useAppData()
  const loggedIn = cloud.status !== 'off'
  const [total, setTotal] = useState<number | null>(null)
  useEffect(() => {
    if (!BOT_URL || !loggedIn) return
    let live = true
    void (async () => {
      try {
        const v = await mpView((u, i) => fetch(u, i), await botToken())
        if (live) setTotal(v && v.configured ? v.total : null)
      } catch {
        if (live) setTotal(null)
      }
    })()
    return () => {
      live = false
    }
  }, [botToken, loggedIn])
  return total
}
