import type { ISODate } from '@/lib/types'

// Links de cobrança (shares). O link é uma página só de leitura hospedada no bot (<url do bot>/s/<token>).
// O app só guarda o token em `shares` (JSON cru do armazenamento): quem monta a página é o worker, com o motor de regras,
// a partir do snapshot que o app sincroniza. Formato do antigo (normalização ~l.295): { type, ref, created }.

export type ShareType = 'person' | 'group' | 'debt' | 'owe'

export interface Share {
  type: ShareType
  /** person/owe = nome em minúsculas (nameKey); group = id do grupo; debt = id da dívida */
  ref: string
  created?: ISODate
}

export type Shares = Record<string, Share>

const CHARS = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TOKEN_RE = /^[A-Za-z0-9]{16,40}$/

export const isShareToken = (t: string) => TOKEN_RE.test(t)

/** token de 22 caracteres sem letras ambíguas (newShareToken ~l.6564) */
export function newShareToken(
  random: (n: number) => Uint8Array = (n) => {
    const a = new Uint8Array(n)
    globalThis.crypto.getRandomValues(a)
    return a
  },
): string {
  return Array.from(random(22), (b) => CHARS[b % CHARS.length]).join('')
}

const TYPES: ShareType[] = ['person', 'group', 'debt', 'owe']

/** só os links válidos (mesmo filtro do antigo); o resto do objeto cru não é tocado por aqui */
export function readShares(raw: unknown): Shares {
  const out: Shares = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [t, v] of Object.entries(raw as Record<string, unknown>)) {
    const sh = v as Partial<Share> | null
    if (isShareToken(t) && sh && TYPES.includes(sh.type as ShareType) && typeof sh.ref === 'string') out[t] = sh as Share
  }
  return out
}

export function shareFor(shares: Shares, type: ShareType, ref: string): string | null {
  for (const [t, sh] of Object.entries(shares)) if (sh.type === type && sh.ref === ref) return t
  return null
}

export function shareUrl(botUrl: string | undefined, token: string): string {
  return botUrl ? botUrl.trim().replace(/\/+$/, '') + '/s/' + token : ''
}

/** link já criado de um tipo/ref, ou '' (sem bot ligado ou sem link) */
export function shareLinkFor(raw: unknown, botUrl: string | undefined, type: ShareType, ref: string): string {
  const t = shareFor(readShares(raw), type, ref)
  return t ? shareUrl(botUrl, t) : ''
}

/** acrescenta o link em `raw.shares` (o objeto cru do armazenamento) e devolve o token */
export function addShare(raw: Record<string, unknown>, type: ShareType, ref: string, today: ISODate, token = newShareToken()): string {
  const cur = raw.shares && typeof raw.shares === 'object' && !Array.isArray(raw.shares) ? (raw.shares as Record<string, unknown>) : {}
  raw.shares = { ...cur, [token]: { type, ref, created: today } satisfies Share }
  return token
}

/** tira o link; devolve o que havia (para o Desfazer) */
export function removeShare(raw: Record<string, unknown>, token: string): Share | undefined {
  const cur = raw.shares && typeof raw.shares === 'object' && !Array.isArray(raw.shares) ? { ...(raw.shares as Record<string, unknown>) } : {}
  const old = cur[token] as Share | undefined
  delete cur[token]
  raw.shares = cur
  return old
}

export const firstName = (name: string) => String(name).trim().split(/\s+/)[0] || name

/** mensagem de WhatsApp que acompanha o link (openShareDialog ~l.6716) */
export function shareWaText(type: ShareType, label: string, url: string): string {
  if (type === 'group') return `Pessoal, aqui dá pra ver quem já pagou o *${label}* e quanto falta pra cada um: ${url}`
  if (type === 'owe') return `Oi ${firstName(label)}! Aqui dá pra ver quanto falta eu te pagar, com o que já paguei: ${url}`
  return `Oi ${firstName(label)}! Aqui tá o resumo do que ficou em aberto comigo, com as parcelas e o PIX: ${url}`
}

export function shareTitle(type: ShareType, label: string): string {
  if (type === 'group') return 'Link do grupo'
  if (type === 'owe') return 'Link do que devo · ' + firstName(label)
  if (type === 'debt') return 'Link desta dívida · ' + firstName(label)
  return 'Link de cobrança · ' + firstName(label)
}

export interface ViewStat {
  count: number
  first?: string
  last: string
}

/** "Aberto 3 vezes · último ontem às 14:05" */
export function viewsText(v: ViewStat | undefined, today: ISODate, now = new Date(v?.last ?? 0)): string {
  if (!v || !v.last) return 'Ainda não foi aberto.'
  const day = v.last.slice(0, 10)
  const diff = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000)
  const rel = diff <= 0 ? 'hoje' : diff === 1 ? 'ontem' : 'há ' + diff + ' dias'
  const hhmm = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `Aberto ${v.count} ${v.count === 1 ? 'vez' : 'vezes'} · último ${rel} às ${hhmm}`
}
