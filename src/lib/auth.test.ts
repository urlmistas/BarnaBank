import { describe, expect, it, vi } from 'vitest'
import { cloudErrorText, CloudError, SESSION_KEY, type Fetch } from '@/lib/cloud'
import { consumeAuthLink, loginFromLink, parseAuthHash, AUTH_HASH_KEY } from './auth-link'
import { fetchUser, isEmail, pwMissing, redirectUrl, requestRecovery, signUp, updatePassword } from './auth'

const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const fakeFetch = (status: number, body: unknown) => {
  const calls: { url: string; init?: RequestInit }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url, init })
    return res(status, body)
  }
  return { f, calls }
}

describe('senha', () => {
  it('lista o que falta', () => {
    expect(pwMissing('abc')).toEqual(['len', 'up', 'num', 'sym'])
    expect(pwMissing('Abcdef1!')).toEqual([])
    expect(pwMissing('abcdefgh')).toEqual(['up', 'num', 'sym'])
  })
  it('e-mail', () => {
    expect(isEmail(' a@b.com ')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
  })
  it('redirectUrl é a página sem hash', () => {
    expect(redirectUrl({ origin: 'https://x.github.io', pathname: '/BarnaBank/' })).toBe('https://x.github.io/BarnaBank/')
  })
})

describe('signUp', () => {
  it('sem confirmação de e-mail já traz a sessão', async () => {
    const { f, calls } = fakeFetch(200, { access_token: 'a', refresh_token: 'r', expires_in: 100, user: { id: 'u', email: 'a@b.com' } })
    const out = await signUp(f, 'a@b.com', 'Senha123!', 'https://x/BarnaBank/', 1_000_000)
    expect(out.session).toMatchObject({ access: 'a', refresh: 'r', uid: 'u', email: 'a@b.com' })
    expect(calls[0].url).toContain('/auth/v1/signup?redirect_to=' + encodeURIComponent('https://x/BarnaBank/'))
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ email: 'a@b.com', password: 'Senha123!' })
    // a senha só vai no corpo, nunca na URL
    expect(calls[0].url).not.toContain('Senha123')
  })

  it('com confirmação de e-mail não há sessão', async () => {
    const { f } = fakeFetch(200, { id: 'u', email: 'a@b.com' })
    expect((await signUp(f, 'a@b.com', 'Senha123!')).session).toBeNull()
  })

  it('e-mail já cadastrado vira mensagem clara', async () => {
    const { f } = fakeFetch(422, { error_code: 'user_already_exists', msg: 'User already registered' })
    const err = await signUp(f, 'a@b.com', 'Senha123!').catch((e) => e)
    expect(cloudErrorText(err)).toBe('Esse e-mail já tem conta. Use "Entrar".')
  })
})

describe('recuperação', () => {
  it('pede o link e troca a senha com o token do link', async () => {
    const a = fakeFetch(200, {})
    await requestRecovery(a.f, 'a@b.com', 'https://x/BarnaBank/')
    expect(a.calls[0].url).toContain('/auth/v1/recover?redirect_to=')
    const b = fakeFetch(200, {})
    await updatePassword(b.f, 'tok', 'Nova123!')
    expect(b.calls[0].init?.method).toBe('PUT')
    expect((b.calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(b.calls[0].url).not.toContain('Nova123')
  })

  it('mensagens: senha fraca, e-mail não confirmado, limite', () => {
    expect(cloudErrorText(new CloudError('Password should be at least 8 characters', 422, 'weak_password'))).toMatch(/Senha fraca/)
    expect(cloudErrorText(new CloudError('Email not confirmed', 400))).toMatch(/Confirme seu e-mail/)
    expect(cloudErrorText(new CloudError('x', 429, 'over_email_send_rate_limit'))).toMatch(/Muitas tentativas/)
  })

  it('fetchUser lê o usuário', async () => {
    const { f } = fakeFetch(200, { id: 'u', email: 'a@b.com' })
    expect(await fetchUser(f, 't')).toEqual({ id: 'u', email: 'a@b.com' })
  })
})

describe('link do e-mail', () => {
  it('lê tokens de recuperação', () => {
    expect(parseAuthHash('#access_token=A&refresh_token=R&expires_in=3600&type=recovery')).toEqual({
      type: 'recovery', accessToken: 'A', refreshToken: 'R', expiresIn: 3600,
    })
  })
  it('link vencido vira erro legível', () => {
    expect(parseAuthHash('error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')?.error).toBe(
      'Email link is invalid or has expired',
    )
  })
  it('hash sem token não é link', () => {
    expect(parseAuthHash('#/pessoas')).toBeNull()
  })
  it('consumeAuthLink é de uso único', () => {
    const m = new Map([[AUTH_HASH_KEY, 'access_token=A&refresh_token=R&type=signup']])
    const s = { getItem: (k: string) => m.get(k) ?? null, removeItem: (k: string) => void m.delete(k) }
    expect(consumeAuthLink(s)?.accessToken).toBe('A')
    expect(consumeAuthLink(s)).toBeNull()
  })

  it('loginFromLink grava só bbweb_session e recarrega', async () => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) })
    const { f } = fakeFetch(200, { id: 'u1', email: 'a@b.com' })
    const reload = vi.fn()
    await loginFromLink(f, { type: 'signup', accessToken: 'A', refreshToken: 'R', expiresIn: 3600 }, reload)
    expect(reload).toHaveBeenCalled()
    expect([...m.keys()]).toEqual([SESSION_KEY])
    expect(JSON.parse(m.get(SESSION_KEY)!)).toMatchObject({ access: 'A', refresh: 'R', uid: 'u1', email: 'a@b.com' })
    vi.unstubAllGlobals()
  })
})
