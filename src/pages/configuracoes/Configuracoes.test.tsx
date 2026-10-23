// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '@/lib/storage'
import type { BotUiState, CloudState } from '@/app/data-context'
import { Configuracoes } from './Configuracoes'

const state = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('@/app/data-context', () => ({ useAppData: () => state.current }))

function setup(over: { cloud?: CloudState; bot?: BotUiState; conflict?: object | null; connectBot?: () => Promise<string | null>; status?: 'loading' | 'ready'; source?: string; prefs?: object } = {}) {
  const fns = {
    setPrefs: vi.fn(), signOut: vi.fn(), refreshCloud: vi.fn(), signIn: vi.fn(), disconnectBot: vi.fn(), setConflictOpen: vi.fn(),
    connectBot: vi.fn(over.connectBot ?? (async () => null)),
  }
  state.current = {
    status: over.status ?? 'ready',
    result: over.status === 'loading' ? null : { data: {}, settings: DEFAULT_SETTINGS, source: over.source ?? 'local' },
    today: '2026-10-23',
    money: (v: number) => `R$ ${v}`,
    date: (d: string) => d,
    baseSettings: DEFAULT_SETTINGS,
    prefs: over.prefs ?? {},
    cloud: over.cloud ?? { status: 'off' },
    bot: over.bot ?? { status: 'off' },
    conflict: over.conflict ?? null,
    ...fns,
  }
  render(<Configuracoes />)
  return fns
}

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})
afterEach(cleanup)

describe('Configuracoes', () => {
  it('mostra as seções', () => {
    setup()
    for (const t of ['Conta', 'Nuvem e bot do Telegram', 'Aparência', 'Formatos', 'Dados']) expect(screen.getByRole('heading', { name: t })).toBeTruthy()
  })

  it('desconectado: botão Entrar abre o diálogo de login', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
  })

  it('conectado: mostra o e-mail, Sincronizar agora e Sair chamam o contexto', () => {
    const fns = setup({ cloud: { status: 'ok', email: 'a@b.com', updatedAt: '2026-10-20T10:00:00Z' } })
    expect(screen.getByText('a@b.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(fns.refreshCloud).toHaveBeenCalled()
    expect(fns.signOut).toHaveBeenCalled()
  })

  it('carregando a conta: Sincronizar agora fica desabilitado', () => {
    setup({ cloud: { status: 'loading', email: 'a@b.com' } })
    expect((screen.getByRole('button', { name: 'Sincronizar agora' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('erro na nuvem: mostra a mensagem', () => {
    setup({ cloud: { status: 'error', email: 'a@b.com', error: 'Sem conexão.' } })
    expect(screen.getAllByText(/Sem conexão\./).length).toBeGreaterThan(0)
  })

  it('Dados: carregando mostra "Carregando…" e não o selo "Sem dados"', () => {
    setup({ status: 'loading' })
    expect(screen.getByText('Carregando…')).toBeTruthy()
    expect(screen.queryByText('Sem dados')).toBeNull()
  })

  it('Dados: mostra a origem', () => {
    setup({ source: 'demo' })
    expect(screen.getByText('Demonstração')).toBeTruthy()
  })

  it('Formatos: trocar a moeda grava a preferência; "Voltar ao padrão" limpa', () => {
    const fns = setup({ prefs: { currency: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }))
    expect(fns.setPrefs).toHaveBeenCalledWith({})
    fireEvent.change(screen.getByLabelText('Moeda'), { target: { value: '' } })
    expect(fns.setPrefs).toHaveBeenCalledWith({ currency: undefined })
  })

  it('bot desligado: pede endereço e chave (campo de senha) e conecta', async () => {
    const fns = setup()
    fireEvent.change(screen.getByLabelText('Endereço do bot'), { target: { value: 'https://bot.exemplo.workers.dev' } })
    const key = screen.getByLabelText('Chave (SYNC_KEY)') as HTMLInputElement
    expect(key.type).toBe('password')
    fireEvent.change(key, { target: { value: 'segredo-123456789' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    await waitFor(() => expect(fns.connectBot).toHaveBeenCalledWith('https://bot.exemplo.workers.dev', 'segredo-123456789'))
  })

  it('bot: erro de conexão aparece na tela', async () => {
    setup({ connectBot: async () => 'Chave errada.' })
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }))
    expect((await screen.findByText('Chave errada.')).getAttribute('role')).toBe('alert')
  })

  it('bot ligado: mostra o endereço sem a chave e permite desligar', () => {
    const fns = setup({ bot: { status: 'ok', url: 'https://bot.exemplo.workers.dev', last: '2026-10-20T10:00:00Z' } })
    expect(screen.getByText('bot.exemplo.workers.dev')).toBeTruthy()
    expect(screen.queryByLabelText('Chave (SYNC_KEY)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Desligar' }))
    expect(fns.disconnectBot).toHaveBeenCalled()
  })

  it('diferença entre aparelho e conta: botão Resolver reabre o diálogo', () => {
    const fns = setup({ cloud: { status: 'ok', email: 'a@b.com' }, conflict: { updated_at: '2026-10-20T10:00:00Z', data: {} } })
    fireEvent.click(screen.getByRole('button', { name: 'Resolver' }))
    expect(fns.setConflictOpen).toHaveBeenCalledWith(true)
  })
})
