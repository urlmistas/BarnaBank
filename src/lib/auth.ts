import { sbFetch, toSession, type CloudSession, type Fetch, type TokenResponse } from '@/lib/cloud'

// Criar conta, recuperar senha e trocar a senha (Supabase Auth). Mesmos caminhos do app antigo
// (submit do authForm ~l.8366-8394). Nada aqui guarda senha: ela só vai no corpo da chamada.

/** regras da senha (valem ao criar conta e ao trocar; quem já tem conta entra com a que tem) — PW_TESTS ~l.8307 */
export const PW_RULES = [
  { id: 'len', label: 'Mínimo de 8 caracteres', test: (p: string) => p.length >= 8 },
  { id: 'up', label: 'Uma letra maiúscula', test: (p: string) => /[A-ZÀ-Ý]/.test(p) },
  { id: 'low', label: 'Uma letra minúscula', test: (p: string) => /[a-zß-ÿ]/.test(p) },
  { id: 'num', label: 'Um número', test: (p: string) => /\d/.test(p) },
  { id: 'sym', label: 'Um caractere especial (!@#$…)', test: (p: string) => /[^A-Za-zÀ-ÿ0-9\s]/.test(p) },
] as const

/** ids das regras que a senha ainda não cumpre */
export const pwMissing = (p: string): string[] => PW_RULES.filter((r) => !r.test(p)).map((r) => r.id)

export const isEmail = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim())

/** para onde o link do e-mail devolve o usuário: esta própria página (sem hash nem busca) */
export const redirectUrl = (loc: Pick<Location, 'origin' | 'pathname'> | undefined = globalThis.location) => (loc ? loc.origin + loc.pathname : '')

/**
 * Cria a conta. Se o projeto não exige confirmar o e-mail, já volta com a sessão (`session`);
 * senão `session` é null e o usuário precisa abrir o link enviado por e-mail.
 */
export async function signUp(fetcher: Fetch, email: string, password: string, redirectTo = redirectUrl(), now = Date.now()): Promise<{ session: CloudSession | null }> {
  const j = await sbFetch<Partial<TokenResponse> | null>(fetcher, '/auth/v1/signup?redirect_to=' + encodeURIComponent(redirectTo), {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (j && j.access_token && j.refresh_token) return { session: toSession(j as TokenResponse, now) }
  return { session: null }
}

/** pede o e-mail de recuperação (a resposta é a mesma exista a conta ou não) */
export async function requestRecovery(fetcher: Fetch, email: string, redirectTo = redirectUrl()): Promise<void> {
  await sbFetch<unknown>(fetcher, '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/** troca a senha da sessão (token do link de recuperação) */
export async function updatePassword(fetcher: Fetch, accessToken: string, password: string): Promise<void> {
  await sbFetch<unknown>(fetcher, '/auth/v1/user', { method: 'PUT', body: JSON.stringify({ password }) }, accessToken)
}

export async function fetchUser(fetcher: Fetch, accessToken: string): Promise<{ id: string; email?: string }> {
  return sbFetch<{ id: string; email?: string }>(fetcher, '/auth/v1/user', { method: 'GET' }, accessToken)
}
