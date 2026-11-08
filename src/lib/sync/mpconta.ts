import type { Fetch } from '@/lib/cloud'
import { BOT_URL } from './telegram-link'
import { BotError } from './worker'

// Conta Mercado Pago (rota /api/mpconta do bot): saldo e porquinhos estimados pelas movimentações.
// Só o dono da conta enxerga; para os outros a rota responde 403/404 e a tela some.

export interface MpPot {
  id: string
  name: string
  valor: number
  /** % do CDI que o porquinho rende */
  pct: number
}

export interface MpMov {
  id: string
  at: string
  tipo: string
  label: string
  valor: number
  /** 1 = entrou na conta, -1 = saiu */
  sinal: number
  pot: string
}

export interface MpView {
  configured: true
  saldo: number
  saldoPct: number
  since: string
  syncedAt: string | null
  /** último dia útil do CDI já aplicado */
  yieldDate: string
  pots: MpPot[]
  total: number
  movs: MpMov[]
  ignoradas: { id: string; at: string; valor: number; motivo: string }[]
}

export interface MpFound {
  id: string
  movimentos: number
  ultimo: string
  /** valor que o porquinho recebe a cada gasto (0 = não recebe) */
  porGasto: number
}

export interface MpSave {
  saldo: number
  saldoPct: number
  pots: Record<string, { name: string; valor: number; pct: number }>
}

async function call<T>(fetcher: Fetch, token: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, base = BOT_URL): Promise<T> {
  let r: Response
  try {
    r = await fetcher(base + '/api/mpconta', {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new BotError('failed to fetch')
  }
  if (!r.ok) throw new BotError('Erro ' + r.status, r.status)
  return (await r.json()) as T
}

/** null = esta conta não usa (rota desligada ou de outro dono); { configured: false } = ainda não configurada */
export async function mpView(fetcher: Fetch, token: string, base?: string): Promise<MpView | { configured: false } | null> {
  try {
    return await call<MpView | { configured: false }>(fetcher, token, 'GET', undefined, base)
  } catch (e) {
    if (e instanceof BotError && (e.status === 403 || e.status === 404)) return null
    throw e
  }
}

export const mpFind = (fetcher: Fetch, token: string, base?: string) => call<{ pots: MpFound[] }>(fetcher, token, 'POST', { acao: 'descobrir' }, base)
export const mpSave = (fetcher: Fetch, token: string, body: MpSave, base?: string) => call<MpView>(fetcher, token, 'POST', body, base)
export const mpRemove = (fetcher: Fetch, token: string, base?: string) => call<{ ok: boolean }>(fetcher, token, 'DELETE', undefined, base)
