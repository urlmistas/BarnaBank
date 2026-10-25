import type { Fetch } from '@/lib/cloud'
import { applySnapshot, buildSnapshot, isLocalEmpty, localHash } from './snapshot'
import { STORAGE_KEY } from '@/lib/storage'

// Sincronização com o bot do Telegram (worker na Cloudflare, rota /api/state).
// Portada de cloudSync/cloudPush do app antigo (app.js ~l.5828-6450). Diferenças de propósito:
// - o worker aplica sozinho as mensagens do Telegram (tem o mesmo motor de regras), então este app
//   NÃO aplica ops: só envia os dados do aparelho e adota o que o worker devolve;
// - não manda `summary` nem `shares` (o worker recalcula);
// - a configuração fica na MESMA chave do app antigo, então o que já foi configurado continua valendo.

export const BOT_KEY = 'barnabank_cloud'
/** no lugar da SYNC_KEY: fala com o bot pelo login da conta (token da sessão) */
export const ACCOUNT_KEY = '@conta'

export interface BotCfg {
  url?: string
  /** SYNC_KEY (segredo: nunca vai para log nem para URL) */
  key?: string
  rev?: number | string
  /** hash dos dados deste aparelho na última sincronização */
  synced?: string
  last?: string
  err?: string
}

export interface BotState {
  snapshot?: Record<string, unknown> | null
  inbox?: { id: string }[]
  undo?: { id: string }[]
  rev?: number | string
  updatedAt?: string | null
  bot?: string
}

export type BotResult =
  | { kind: 'off' }
  | { kind: 'noop' }
  | { kind: 'pushed' }
  | { kind: 'adopted' }

export interface BotEnv {
  fetcher: Fetch
  now?: () => Date
  /** token do login (renova se preciso); usado quando a chave é ACCOUNT_KEY */
  token?: () => Promise<string>
}

function ls(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readBotCfg(): BotCfg {
  try {
    const v: unknown = JSON.parse(ls()?.getItem(BOT_KEY) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as BotCfg) : {}
  } catch {
    return {}
  }
}

export function writeBotCfg(cfg: BotCfg | null) {
  try {
    if (cfg && Object.keys(cfg).length) ls()?.setItem(BOT_KEY, JSON.stringify(cfg))
    else ls()?.removeItem(BOT_KEY)
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
}

export const botOn = (cfg: BotCfg) => !!(cfg.url && cfg.key)
export const botByAccount = (cfg: Pick<BotCfg, 'key'>) => cfg.key === ACCOUNT_KEY

export class BotError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

/** mensagem curta em português; nunca inclui a chave */
export function botErrorText(e: unknown): string {
  const err = e as BotError
  if (err?.status === 401) return err.message === 'Sem login' ? 'Entre na sua conta de novo.' : 'Chave errada.'
  if (err?.status) return 'O bot respondeu com erro ' + err.status + '.'
  if (/failed to fetch|networkerror|load failed/i.test(err?.message || '')) return 'Sem conexão com o bot.'
  return 'Não consegui falar com o bot.'
}

const base = (url: string) => url.trim().replace(/\/+$/, '')

async function accountToken(env: BotEnv): Promise<string> {
  try {
    if (!env.token) throw new Error('sem login')
    return await env.token()
  } catch {
    throw new BotError('Sem login', 401)
  }
}

export async function call<T = BotState>(env: BotEnv, cfg: Pick<BotCfg, 'url' | 'key'>, method: 'GET' | 'PUT', body?: unknown, path = '/api/state'): Promise<T> {
  let r: Response
  try {
    const bearer = botByAccount(cfg) ? await accountToken(env) : (cfg.key ?? '')
    r = await env.fetcher(base(cfg.url ?? '') + path, {
      method,
      headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    if (e instanceof BotError) throw e
    throw new BotError('failed to fetch')
  }
  if (!r.ok) throw new BotError('Erro ' + r.status, r.status)
  try {
    return (await r.json()) as T
  } catch {
    return {} as T
  }
}

/** testa endereço e chave (GET, sem alterar nada) */
export const testBot = (env: BotEnv, url: string, key: string) => call(env, { url, key }, 'GET')

function localTgLog(): Record<string, { undone?: boolean }> {
  try {
    const raw: unknown = JSON.parse(ls()?.getItem(STORAGE_KEY) || '{}')
    const log = raw && typeof raw === 'object' ? (raw as { tgLog?: unknown }).tgLog : null
    return log && typeof log === 'object' ? (log as Record<string, { undone?: boolean }>) : {}
  } catch {
    return {}
  }
}

/** só confirma ao worker o que já está nos dados daqui (se não estiver, o worker reaplica e não perde nada) */
async function confirm(env: BotEnv, cfg: BotCfg, r: BotState) {
  const log = localTgLog()
  const ack = (r.inbox ?? []).map((o) => o.id).filter((id) => log[id])
  const undoAck = (r.undo ?? []).map((u) => u.id).filter((id) => log[id]?.undone)
  if (!ack.length && !undoAck.length) return
  await call(env, cfg, 'PUT', { ack, undoAck })
}

export async function botSync(env: BotEnv): Promise<BotResult> {
  const cfg = readBotCfg()
  if (!botOn(cfg)) return { kind: 'off' }
  const stamp = () => (env.now ? env.now() : new Date()).toISOString()
  const save = (patch: Partial<BotCfg>) => writeBotCfg({ ...readBotCfg(), ...patch })
  try {
    const r = await call(env, cfg, 'GET')
    const localChanged = !cfg.synced || localHash() !== cfg.synced
    let result: BotResult = { kind: 'noop' }

    if (r.snapshot && isLocalEmpty()) {
      // este aparelho está vazio e o bot tem dados
      if (applySnapshot(r.snapshot, env.now?.())) {
        save({ rev: r.rev, synced: localHash(), last: stamp(), err: '' })
        result = { kind: 'adopted' }
      }
    } else if (!localChanged && r.snapshot && r.rev && r.rev !== cfg.rev) {
      // só o bot mudou (mensagens do Telegram): pega a versão de lá
      if (applySnapshot(r.snapshot, env.now?.())) {
        save({ rev: r.rev, synced: localHash(), last: stamp(), err: '' })
        result = { kind: 'adopted' }
      }
    } else if (localChanged && !isLocalEmpty()) {
      // este aparelho mudou: envia SEM confirmar nada; o worker reaplica por cima as mensagens que ainda não estavam aqui
      const hashSent = localHash()
      await call(env, cfg, 'PUT', { snapshot: buildSnapshot(env.now?.()) })
      const r2 = await call(env, cfg, 'GET')
      // se a pessoa mexeu durante o envio, não sobrescreve: a próxima sincronização manda de novo
      if (r2.snapshot && localHash() === hashSent && applySnapshot(r2.snapshot, env.now?.())) {
        save({ rev: r2.rev, synced: localHash(), last: stamp(), err: '' })
        await confirm(env, cfg, r2)
        return { kind: 'pushed' }
      }
      save({ rev: r2.rev ?? r.rev, synced: hashSent, last: stamp(), err: '' })
      return { kind: 'pushed' }
    } else {
      save({ last: stamp(), err: '' })
    }
    await confirm(env, cfg, r)
    return result
  } catch (e) {
    save({ err: botErrorText(e) })
    throw e
  }
}
