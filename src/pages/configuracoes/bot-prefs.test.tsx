// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { choose } from '@/test-select'
import { BotPrefsSection } from './telegram'

const app = vi.hoisted(() => ({ botToken: async () => 'tok' }))
vi.mock('@/app/data-context', () => ({ useAppData: () => app }))

let server: { prefs: Record<string, unknown>; calls: { method: string; url: string; body?: Record<string, unknown>; auth: string | null }[]; fail: number }
beforeEach(() => {
  localStorage.setItem('barnabank_cloud', JSON.stringify({ url: 'https://bot.exemplo.workers.dev', key: '@conta' }))
  server = { prefs: { daily: true, weekly: true, monthly: true, friends: true, hour: 9, weekday: 0 }, calls: [], fail: 0 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
      server.calls.push({ method, url, body, auth: ((init?.headers ?? {}) as Record<string, string>).Authorization ?? null })
      if (server.fail && method === 'PUT') return new Response('{}', { status: 500 })
      if (method === 'PUT') server.prefs = { ...server.prefs, ...body }
      return new Response(JSON.stringify({ prefs: server.prefs }))
    }),
  )
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('Lembretes do bot', () => {
  it('lê as preferências do bot com o login da conta', async () => {
    server.prefs = { ...server.prefs, hour: 7, daily: false }
    render(<BotPrefsSection />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Horário dos avisos' }).textContent).toBe('07:00'))
    expect(screen.getByRole('switch', { name: 'Resumo do dia' }).getAttribute('aria-checked')).toBe('false')
    expect(server.calls[0]).toMatchObject({ method: 'GET', url: 'https://bot.exemplo.workers.dev/api/prefs', auth: 'Bearer tok' })
  })

  it('mudar o horário e ligar ou desligar manda só o que mudou', async () => {
    render(<BotPrefsSection />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Horário dos avisos' }).textContent).toBe('09:00'))
    choose(screen.getByRole('combobox', { name: 'Horário dos avisos' }), '20')
    await waitFor(() => expect(server.calls.at(-1)?.body).toEqual({ hour: 20 }))
    expect(screen.getByRole('combobox', { name: 'Horário dos avisos' }).textContent).toBe('20:00')
    fireEvent.click(screen.getByRole('switch', { name: 'Avisar quem me deve' }))
    await waitFor(() => expect(server.calls.at(-1)?.body).toEqual({ friends: false }))
    expect(screen.getByRole('switch', { name: 'Avisar quem me deve' }).getAttribute('aria-checked')).toBe('false')
  })

  it('o dia do resumo da semana só vale com o resumo ligado', async () => {
    render(<BotPrefsSection />)
    const day = await screen.findByRole('combobox', { name: 'Dia do resumo da semana' })
    await waitFor(() => expect((day as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('switch', { name: 'Resumo da semana' }))
    await waitFor(() => expect((screen.getByRole('combobox', { name: 'Dia do resumo da semana' }) as HTMLButtonElement).disabled).toBe(true))
  })

  it('se o bot recusar, volta ao que era e avisa', async () => {
    render(<BotPrefsSection />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Resumo do mês' }).getAttribute('aria-checked')).toBe('true'))
    server.fail = 1
    fireEvent.click(screen.getByRole('switch', { name: 'Resumo do mês' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/erro 500/))
    expect(screen.getByRole('switch', { name: 'Resumo do mês' }).getAttribute('aria-checked')).toBe('true')
  })
})
