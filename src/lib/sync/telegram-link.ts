import type { Fetch } from '@/lib/cloud'
import { BotError } from './worker'

// Vincular o Telegram à conta: o app pede um código ao bot (rota /api/link, com o login da conta),
// a pessoa manda o código no Telegram e o bot passa a guardar os dados dela separados dos de outras contas.

/** endereço do bot compartilhado (definido no build: VITE_BOT_URL). Vazio = só o modo antigo, com chave. */
export const botBase = (raw: unknown): string => {
  const v = String(raw ?? '').trim().replace(/\/+$/, '')
  // a variável do repositório pode vir sem o https:// (aí o endereço viraria um caminho relativo do site)
  return v && !/^https?:\/\//i.test(v) ? 'https://' + v : v
}
export const BOT_URL = botBase(import.meta.env.VITE_BOT_URL)

export interface LinkStatus {
  linked: boolean
  /** usuário do bot, sem @ */
  bot: string
  at: string | null
}

export interface LinkCode {
  code: string
  /** segundos até o código vencer */
  expiresIn: number
  bot: string
  /** link t.me que já manda o código */
  url: string
}

async function call<T>(fetcher: Fetch, token: string, method: 'GET' | 'POST' | 'DELETE', base = BOT_URL): Promise<T> {
  let r: Response
  try {
    r = await fetcher(base + '/api/link', { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } })
  } catch {
    throw new BotError('failed to fetch')
  }
  if (!r.ok) throw new BotError('Erro ' + r.status, r.status)
  return (await r.json()) as T
}

export const linkStatus = (fetcher: Fetch, token: string, base?: string) => call<LinkStatus>(fetcher, token, 'GET', base)
export const linkCreate = (fetcher: Fetch, token: string, base?: string) => call<LinkCode>(fetcher, token, 'POST', base)
export const linkRemove = (fetcher: Fetch, token: string, base?: string) => call<{ ok: boolean }>(fetcher, token, 'DELETE', base)

/** "K7M2Q9XA" → "K7M2 Q9XA" (mais fácil de ler e de ditar) */
export const codeLabel = (code: string) => code.replace(/^(.{4})(.+)$/, '$1 $2')
