import { useCallback, useEffect, useRef, useState } from 'react'
import type { Fetch } from '@/lib/cloud'
import { botErrorText, BotError, botOn, readBotCfg, type BotCfg } from '@/lib/sync/worker'
import type { ViewStat } from './shares'

// O que só o bot sabe: pedidos feitos pelos links (claims), quantas vezes cada link foi aberto (views) e o nome do bot.
// Vem do mesmo GET /api/state da sincronização, mas aqui é lido sob demanda (quando a tela abre) e sem tocar nos dados.
// A chave (SYNC_KEY) só vai no cabeçalho Authorization; nunca em URL nem em log.

export interface Claim {
  id: string
  kind: 'pago' | 'prazo'
  at: string
  amount: number
  note?: string
  label: string
  hasPhoto?: boolean
  token?: string
  /** pedido de prazo: a data pedida e quando vencia */
  newDate?: string
  due?: string
}

export interface BotExtras {
  claims: Claim[]
  views: Record<string, ViewStat>
  bot: string
}

export const NO_EXTRAS: BotExtras = { claims: [], views: {}, bot: '' }

const base = (url: string) => url.trim().replace(/\/+$/, '')
const headers = (cfg: Pick<BotCfg, 'key'>) => ({ Authorization: 'Bearer ' + (cfg.key ?? ''), 'Content-Type': 'application/json' })

async function get(fetcher: Fetch, cfg: BotCfg, path: string): Promise<unknown> {
  let r: Response
  try {
    r = await fetcher(base(cfg.url ?? '') + path, { headers: headers(cfg) })
  } catch {
    throw new BotError('failed to fetch')
  }
  if (!r.ok) throw new BotError('Erro ' + r.status, r.status)
  return r.json()
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** lê claims/views/bot do GET /api/state; formato inesperado vira lista vazia */
export function parseExtras(j: unknown): BotExtras {
  if (!isObj(j)) return NO_EXTRAS
  const claims = (Array.isArray(j.claims) ? j.claims : []).filter(
    (c): c is Claim => isObj(c) && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.at === 'string',
  ).map((c) => ({ ...c, kind: c.kind === 'prazo' ? ('prazo' as const) : ('pago' as const), amount: Number(c.amount) || 0 }))
  const views: Record<string, ViewStat> = {}
  if (isObj(j.views)) {
    for (const [t, v] of Object.entries(j.views)) {
      if (isObj(v) && typeof v.last === 'string') views[t] = { count: Number(v.count) || 0, first: typeof v.first === 'string' ? v.first : undefined, last: v.last }
    }
  }
  return { claims, views, bot: typeof j.bot === 'string' ? j.bot : '' }
}

export async function fetchBotExtras(fetcher: Fetch, cfg: BotCfg): Promise<BotExtras> {
  return parseExtras(await get(fetcher, cfg, '/api/state'))
}

/** confirma (ok) ou recusa um pedido. O worker já aplica o pagamento/prazo nos dados dele; o app só precisa sincronizar depois. */
export async function decideClaim(fetcher: Fetch, cfg: BotCfg, id: string, ok: boolean): Promise<'done' | 'already'> {
  let r: Response
  try {
    r = await fetcher(base(cfg.url ?? '') + '/api/claim/' + encodeURIComponent(id), {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify({ decision: ok ? 'ok' : 'no' }),
    })
  } catch {
    throw new BotError('failed to fetch')
  }
  if (!r.ok) throw new BotError('Erro ' + r.status, r.status)
  const j: unknown = await r.json().catch(() => ({}))
  return isObj(j) && j.already ? 'already' : 'done'
}

/** foto de comprovante enviada pelo link, como data URL (ou null) */
export async function fetchClaimPhoto(fetcher: Fetch, cfg: BotCfg, id: string): Promise<string | null> {
  try {
    const j = await get(fetcher, cfg, '/api/claim/' + encodeURIComponent(id) + '/photo')
    const data = isObj(j) ? j.data : null
    return typeof data === 'string' && /^data:image\//.test(data) ? data : null
  } catch {
    return null
  }
}

export interface ExtrasState {
  extras: BotExtras
  /** true se há bot configurado */
  on: boolean
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/** carrega os extras do bot quando monta e quando alguém chama `reload` (sem bot ligado, não faz nada) */
export function useBotExtras(fetcher: Fetch = (u, i) => globalThis.fetch(u, i)): ExtrasState {
  const [extras, setExtras] = useState<BotExtras>(NO_EXTRAS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher

  const reload = useCallback(async () => {
    const cfg = readBotCfg()
    if (!botOn(cfg)) {
      setExtras(NO_EXTRAS)
      return
    }
    setLoading(true)
    try {
      const x = await fetchBotExtras(fetchRef.current, cfg)
      if (alive.current) {
        setExtras(x)
        setError(null)
      }
    } catch (e) {
      if (alive.current) setError(botErrorText(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void reload()
    return () => {
      alive.current = false
    }
  }, [reload])

  return { extras, on: botOn(readBotCfg()), loading, error, reload }
}
