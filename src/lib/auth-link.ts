import { fetchUser } from '@/lib/auth'
import { toSession, writeSession, type CloudSession, type Fetch } from '@/lib/cloud'

// Link do e-mail (confirmar conta ou recuperar senha). O Supabase devolve o usuário para a página com os tokens no
// HASH (`#access_token=…&type=recovery`). Como o app usa HashRouter, o hash é a rota: se ninguém tirar os tokens dali
// antes do roteador subir, o `<Navigate>` do `*` apaga tudo. Quem tira é o script de index.html, que guarda o hash em
// sessionStorage (AUTH_HASH_KEY) e manda a rota para #/configuracoes. Aqui está a leitura do outro lado.

export const AUTH_HASH_KEY = 'bbweb_auth_hash'

export interface AuthLink {
  /** 'recovery' = nova senha; 'signup' e demais = confirmou o e-mail e já vem com sessão */
  type: string
  accessToken: string
  refreshToken: string
  expiresIn: number
  /** link vencido ou inválido (texto do Supabase) */
  error?: string
}

/** lê o hash guardado sem apagar (use com clearAuthLink: o StrictMode do React monta duas vezes em desenvolvimento) */
export function peekAuthLink(storage: Pick<Storage, 'getItem'> | undefined = safeSession()): AuthLink | null {
  try {
    const raw = storage?.getItem(AUTH_HASH_KEY)
    return raw ? parseAuthHash(raw) : null
  } catch {
    return null
  }
}

export function clearAuthLink(storage: Pick<Storage, 'removeItem'> | undefined = safeSession()) {
  try {
    storage?.removeItem(AUTH_HASH_KEY)
  } catch {
    /* sem sessionStorage */
  }
}

/** lê e APAGA o hash guardado (uso único); null se não há link pendente */
export function consumeAuthLink(storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined = safeSession()): AuthLink | null {
  let raw: string | null = null
  try {
    raw = storage?.getItem(AUTH_HASH_KEY) ?? null
    if (raw) storage?.removeItem(AUTH_HASH_KEY)
  } catch {
    return null
  }
  return raw ? parseAuthHash(raw) : null
}

function safeSession(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

export function parseAuthHash(hash: string): AuthLink | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const error = q.get('error_description') || (q.get('error') ? 'O link não é mais válido.' : '')
  if (error) return { type: q.get('type') || '', accessToken: '', refreshToken: '', expiresIn: 0, error: error.replace(/\+/g, ' ') }
  const accessToken = q.get('access_token')
  const refreshToken = q.get('refresh_token')
  if (!accessToken || !refreshToken) return null
  return { type: q.get('type') || '', accessToken, refreshToken, expiresIn: Number(q.get('expires_in')) || 3600 }
}

/** monta a sessão a partir do link (busca o e-mail do usuário) */
export async function sessionFromLink(fetcher: Fetch, link: AuthLink, now = Date.now()): Promise<CloudSession> {
  const user = await fetchUser(fetcher, link.accessToken)
  return toSession({ access_token: link.accessToken, refresh_token: link.refreshToken, expires_in: link.expiresIn, user }, now)
}

/** grava a sessão (só bbweb_session) e recarrega para o app entrar já conectado e sincronizar */
export async function loginFromLink(fetcher: Fetch, link: AuthLink, reload: () => void = () => globalThis.location.reload()): Promise<void> {
  writeSession(await sessionFromLink(fetcher, link))
  reload()
}
