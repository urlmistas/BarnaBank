import type { AppData, Settings } from '@/lib/types'
import { parseAppData } from '@/lib/storage'

// Conta na nuvem (Supabase): login, sessão e chamadas HTTP.
// Mesmo projeto e mesma tabela do app antigo (app.js ~l.8256: SB_URL/SB_KEY, sbPull ~l.8395):
// a linha `bb_user_state` do usuário guarda em `data` o mesmo formato do backup (buildBackup ~l.367).
// O app novo:
// - faz login próprio (e-mail e senha) e guarda só os tokens em `bbweb_session`;
// - nunca toca em `barnabank_sb` (a sessão do antigo: renovar o token dela trocaria o refresh token
//   e derrubaria o login do app antigo);
// - a sincronização (ler/gravar a linha) fica em src/lib/sync/supabase.ts.

export const SB_URL = 'https://epsddfqunjqopylrbbyv.supabase.co'
/** chave publicável (pública por definição; já está no app antigo). O acesso é protegido pelo RLS. */
export const SB_KEY = 'sb_publishable_W04BorQgNFQ2TMGxnaRYow_EwuzV5Ni'
export const SESSION_KEY = 'bbweb_session'

export interface CloudSession {
  access: string
  refresh: string
  /** expiração do access token (segundos desde 1970) */
  exp: number
  uid: string
  email: string
  /** updated_at da linha na nuvem na última sincronização (concorrência otimista) */
  rev?: string
  /** hash dos dados deste aparelho na última sincronização */
  synced?: string
  /** o que a pessoa escolheu no "Qual versão manter?": vale dali em diante, sem perguntar de novo */
  pref?: 'cloud' | 'local'
}

export interface CloudPull {
  data: AppData
  settings: Partial<Settings>
  updatedAt: string
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export class CloudError extends Error {
  status?: number
  code?: string
  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function sbFetch<T>(fetcher: Fetch, path: string, init: RequestInit, token?: string): Promise<T> {
  const headers: Record<string, string> = { apikey: SB_KEY, 'Content-Type': 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  let r: Response
  try {
    r = await fetcher(SB_URL + path, { ...init, headers })
  } catch {
    throw new CloudError('failed to fetch')
  }
  const text = await r.text()
  let j: Record<string, unknown> | null = null
  try {
    j = text ? JSON.parse(text) : null
  } catch {
    j = null
  }
  if (!r.ok) {
    const msg = (j && (j.msg || j.error_description || j.message)) as string | undefined
    throw new CloudError(msg || 'Erro ' + r.status, r.status, (j && ((j.error_code || j.code) as string)) || undefined)
  }
  return j as T
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in?: number
  user?: { id: string; email?: string }
}

export function toSession(j: TokenResponse, now: number, keep?: CloudSession): CloudSession {
  return {
    // renovar o token não muda o que já foi sincronizado
    ...(keep?.rev ? { rev: keep.rev } : {}),
    ...(keep?.synced ? { synced: keep.synced } : {}),
    ...(keep?.pref ? { pref: keep.pref } : {}),
    access: j.access_token,
    refresh: j.refresh_token,
    exp: Math.floor(now / 1000) + (j.expires_in || 3600),
    uid: j.user?.id || keep?.uid || '',
    email: j.user?.email || keep?.email || '',
  }
}

/** login com e-mail e senha (a senha não é guardada) */
export async function signIn(fetcher: Fetch, email: string, password: string, now = Date.now()): Promise<CloudSession> {
  const j = await sbFetch<TokenResponse>(fetcher, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return toSession(j, now)
}

/** token válido; renova se faltar menos de 60 s (o refresh token da sessão do app novo) */
export async function validSession(fetcher: Fetch, s: CloudSession, now = Date.now()): Promise<CloudSession> {
  if (s.exp - 60 > now / 1000) return s
  const j = await sbFetch<TokenResponse>(fetcher, '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: s.refresh }),
  })
  return toSession(j, now, s)
}

/** lê a linha do usuário (GET, sem gravar). null se a conta ainda não tem dados. */
export async function pullState(fetcher: Fetch, s: CloudSession, today: string): Promise<CloudPull | null> {
  const rows = await sbFetch<{ data: unknown; updated_at: string }[]>(
    fetcher,
    '/rest/v1/bb_user_state?select=data,updated_at&user_id=eq.' + encodeURIComponent(s.uid),
    { method: 'GET' },
    s.access,
  )
  const row = rows?.[0]
  if (!row || !row.data || typeof row.data !== 'object') return null
  const data = parseAppData(JSON.stringify(row.data), today)
  if (!data) return null
  const raw = (row.data as { settings?: unknown }).settings
  const settings = raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}
  return { data, settings, updatedAt: row.updated_at }
}

const ERRS: [RegExp, string][] = [
  [/invalid login credentials|invalid_credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail: abra o link que enviamos para você.'],
  [/already registered|user_already_exists/i, 'Esse e-mail já tem conta. Use "Entrar".'],
  [/password.*(at least|short|weak)|weak_password/i, 'Senha fraca demais. Use as regras indicadas.'],
  [/rate limit|too many|over_email_send_rate_limit/i, 'Muitas tentativas. Espere alguns minutos e tente de novo.'],
  [/invalid.*email|email_address_invalid|unable to validate email/i, 'E-mail inválido.'],
  [/failed to fetch|networkerror|load failed/i, 'Sem conexão com a internet.'],
  [/jwt|token|refresh/i, 'Sua sessão expirou. Entre de novo.'],
]

/** mensagem em português para o erro (mesmas regras do sbErrText ~l.8300) */
export function cloudErrorText(e: unknown): string {
  const err = e as CloudError
  const m = (err?.code ? err.code + ' ' : '') + (err?.message || '')
  for (const [re, txt] of ERRS) if (re.test(m)) return txt
  return 'Não deu certo: ' + (err?.message || 'erro desconhecido')
}

/** a sessão deixou de valer (token revogado/expirado): o app deve pedir login de novo */
export const isAuthError = (e: unknown) => {
  const s = (e as CloudError)?.status
  return s === 400 || s === 401 || s === 403
}

// ---------------------------------------------------------------- sessão no navegador (só bbweb_*)

export function readSession(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): CloudSession | null {
  try {
    const raw = storage?.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as CloudSession
    return s && typeof s.access === 'string' && typeof s.refresh === 'string' && typeof s.uid === 'string' && s.uid ? s : null
  } catch {
    return null
  }
}

export function writeSession(s: CloudSession | null, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage) {
  try {
    if (s) storage?.setItem(SESSION_KEY, JSON.stringify(s))
    else storage?.removeItem(SESSION_KEY)
  } catch {
    // navegador sem storage (aba privada etc.): a sessão vale só até recarregar
  }
}
