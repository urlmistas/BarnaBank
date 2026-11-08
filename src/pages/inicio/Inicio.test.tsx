// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { readHistory } from '@/lib/history'
import { Inicio } from './Inicio'

const owe = (over: Record<string, unknown> = {}) => ({
  id: 'p1', name: 'Carlos', kind: 'payable', principal: 300, rate: 0, interestType: 'composto', installments: 3, days: 90,
  date: '2020-01-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)

function mount() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [owe()] }))
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter>
          <Inicio />
        </MemoryRouter>
      </ToastProvider>
    </DataProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
configure({ asyncUtilTimeout: 5000 })

describe('Início: Próximos a pagar', () => {
  it('lista o que eu devo e o Pagar registra o pagamento sem entrar na pessoa', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Próximos a pagar' })
    const before = stored().debts[0].payments.length
    fireEvent.click(await screen.findByRole('button', { name: /^Pagar .* a Carlos$/ }))
    await screen.findByText(/Pago .* a Carlos/)
    expect(stored().debts[0].payments.length).toBe(before + 1)
    // e a alteração entra no histórico, com Desfazer
    expect(readHistory()).toMatchObject([{ msg: expect.stringContaining('Pago') }])
    expect(readHistory()[0].patch).not.toBeNull()
  })

  it('o alerta de atrasados leva ao filtro Em atraso', async () => {
    mount()
    const ver = await screen.findByRole('link', { name: /Ver/ })
    expect(ver.getAttribute('href')).toBe('/pessoas?f=atrasados')
  })
})

describe('Início: faturas de cartão', () => {
  it('fatura que fecha em 2 dias aparece com o melhor dia de compra e leva à fatura', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 8, 12, 0, 0) })
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        debts: [],
        cards: [{ id: 'c1', name: 'Nubank', closingDay: 10, dueDay: 17, limit: 1000 }],
        cardPurchases: [{ id: 'p1', cardId: 'c1', amount: 200, date: '2026-11-03', installments: 1 }],
      }),
    )
    render(
      <DataProvider>
        <ToastProvider>
          <MemoryRouter>
            <Inicio />
          </MemoryRouter>
        </ToastProvider>
      </DataProvider>,
    )
    const link = await screen.findByRole('link', { name: /Fatura do Nubank fecha em 2 dias/ })
    expect(link.getAttribute('href')).toBe('/contas/cartao-c1?m=2026-11')
    expect(link.textContent).toContain('compras a partir de 11/11')
  })
})
