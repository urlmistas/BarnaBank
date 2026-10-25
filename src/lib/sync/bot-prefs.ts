import { call, readBotCfg, type BotEnv } from './worker'

// Lembretes do bot (rota /api/prefs): o que ligar, a hora (Brasília) e o dia do resumo da semana.
// Quem manda os avisos é o bot; aqui só se lê e se grava a escolha.

export interface BotPrefs {
  /** hoje, amanhã e atrasados */
  daily: boolean
  /** resumo da semana, no dia `weekday` */
  weekly: boolean
  /** resumo do mês que passou, no dia 1 */
  monthly: boolean
  /** lembrete no Telegram para quem te deve e entrou pelo convite */
  friends: boolean
  /** 0 a 23, horário de Brasília */
  hour: number
  /** 0 = domingo … 6 = sábado */
  weekday: number
}

export const DEFAULT_BOT_PREFS: BotPrefs = { daily: true, weekly: true, monthly: true, friends: true, hour: 9, weekday: 0 }

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const hourLabel = (h: number) => String(h).padStart(2, '0') + ':00'

function clean(raw: unknown): BotPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = { ...DEFAULT_BOT_PREFS }
  for (const k of ['daily', 'weekly', 'monthly', 'friends'] as const) if (o[k] === false) out[k] = false
  if (Number.isInteger(o.hour) && (o.hour as number) >= 0 && (o.hour as number) <= 23) out.hour = o.hour as number
  if (Number.isInteger(o.weekday) && (o.weekday as number) >= 0 && (o.weekday as number) <= 6) out.weekday = o.weekday as number
  return out
}

export async function getBotPrefs(env: BotEnv): Promise<BotPrefs> {
  const r = await call<{ prefs?: unknown }>(env, readBotCfg(), 'GET', undefined, '/api/prefs')
  return clean(r.prefs)
}

/** grava só o que mudou e devolve as preferências como o bot ficou com elas */
export async function putBotPrefs(env: BotEnv, patch: Partial<BotPrefs>): Promise<BotPrefs> {
  const r = await call<{ prefs?: unknown }>(env, readBotCfg(), 'PUT', patch, '/api/prefs')
  return clean(r.prefs)
}
