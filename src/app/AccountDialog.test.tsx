// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AuthLink } from '@/lib/auth-link'
import { SESSION_KEY } from '@/lib/cloud'
import { AccountDialog } from './AccountDialog'

const ctx = vi.hoisted(() => ({ signIn: vi.fn(async (_e: string, _p: string): Promise<string | null> => null), cloud: { status: 'off' } as Record<string, unknown> }))
vi.mock('./data-context', () => ({ useAppData: () => ({ cloud: ctx.cloud, signIn: ctx.signIn }) }))

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
let fetchMock: ReturnType<typeof vi.fn>

function open(link: AuthLink | null = null, onReload = vi.fn()) {
  const ref = createRef<HTMLDialogElement>()
  render(<AccountDialog dialogRef={ref} link={link} onReload={onReload} />)
  ref.current!.setAttribute('open', '')
  return { ref, onReload }
}
const dlg = () => document.querySelector('dialog')!

beforeEach(() => {
  ctx.signIn.mockClear()
  ctx.signIn.mockImplementation(async () => null)
  ctx.cloud = { status: 'off' }
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const pass = () => dlg().querySelector<HTMLInputElement>('input[autocomplete$="password"]')!

describe('AccountDialog', () => {
  it('login: placeholder "sua senha" e erro de validação', async () => {
    open()
    expect(pass().placeholder).toBe('sua senha')
    fireEvent.submit(dlg().querySelector('form')!)
    expect((await screen.findByRole('alert')).textContent).toMatch(/e-mail válido/)
  })

  it('login chama signIn do contexto e fecha', async () => {
    open()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } })
    fireEvent.change(pass(), { target: { value: 'segredo' } })
    fireEvent.submit(dlg().querySelector('form')!)
    await waitFor(() => expect(ctx.signIn).toHaveBeenCalledWith('a@b.com', 'segredo'))
    await waitFor(() => expect(dlg().hasAttribute('open')).toBe(false))
  })

  it('criar conta: placeholder "crie uma senha forte", checklist, bloqueia senha fraca', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(pass().placeholder).toBe('crie uma senha forte')
    const list = screen.getByRole('list', { name: 'Regras da senha' })
    expect(list.querySelectorAll('[data-ok="true"]').length).toBe(0)
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } })
    fireEvent.change(pass(), { target: { value: 'abc' } })
    fireEvent.submit(dlg().querySelector('form')!)
    expect((await screen.findByRole('alert')).textContent).toMatch(/não atende todas as regras/)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(pass(), { target: { value: 'Abcdef1!' } })
    expect(list.querySelectorAll('[data-ok="true"]').length).toBe(5)
  })

  it('criar conta com confirmação por e-mail volta ao login com aviso', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 'u', email: 'a@b.com' }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } })
    fireEvent.change(pass(), { target: { value: 'Abcdef1!' } })
    fireEvent.submit(dlg().querySelector('form')!)
    expect((await screen.findByText(/Enviamos um link de confirmação para a@b.com/)).textContent).toBeTruthy()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/v1/signup')
    expect(pass().placeholder).toBe('sua senha')
    expect(ctx.signIn).not.toHaveBeenCalled()
  })

  it('criar conta com e-mail já usado mostra a mensagem', async () => {
    fetchMock.mockResolvedValue(json(422, { error_code: 'user_already_exists', msg: 'User already registered' }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } })
    fireEvent.change(pass(), { target: { value: 'Abcdef1!' } })
    fireEvent.submit(dlg().querySelector('form')!)
    expect((await screen.findByRole('alert')).textContent).toMatch(/já tem conta/)
  })

  it('recuperar senha pede o link e não esconde se a conta existe', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci a senha' }))
    expect(screen.queryByLabelText('Senha')).toBeNull()
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'a@b.com' } })
    fireEvent.submit(dlg().querySelector('form')!)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Se esse e-mail tem conta/)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/v1/recover')
  })

  it('link de recuperação abre em "Nova senha", troca a senha, grava a sessão e recarrega', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/auth/v1/user') && init?.method === 'PUT') return json(200, {})
      return json(200, { id: 'u1', email: 'a@b.com' })
    })
    const link: AuthLink = { type: 'recovery', accessToken: 'A', refreshToken: 'R', expiresIn: 3600 }
    const { onReload } = open(link)
    expect(screen.getByRole('heading', { name: 'Nova senha' })).toBeTruthy()
    expect(screen.queryByLabelText('E-mail')).toBeNull()
    fireEvent.change(pass(), { target: { value: 'Nova123!x' } })
    fireEvent.submit(dlg().querySelector('form')!)
    await waitFor(() => expect(onReload).toHaveBeenCalled())
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toMatchObject({ access: 'A', uid: 'u1', email: 'a@b.com' })
    const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT')!
    expect(JSON.parse(String((put[1] as RequestInit).body))).toEqual({ password: 'Nova123!x' })
    expect(String(put[0])).not.toContain('Nova123')
  })

  it('link vencido mostra o erro no login', () => {
    open({ type: 'recovery', accessToken: '', refreshToken: '', expiresIn: 0, error: 'Email link is invalid or has expired' })
    expect(screen.getByRole('alert').textContent).toBe('Email link is invalid or has expired')
    expect(screen.getByRole('heading', { name: 'Entrar na sua conta' })).toBeTruthy()
  })

  it('senha some ao fechar', async () => {
    const { ref } = open()
    fireEvent.change(pass(), { target: { value: 'segredo' } })
    ref.current!.close()
    await waitFor(() => expect(pass().value).toBe(''))
  })
})
