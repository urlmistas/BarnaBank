// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { Pessoas } from './Pessoas'

const cloud = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }))
vi.mock('@/lib/cloud', async (orig) => ({
  ...(await orig<typeof import('@/lib/cloud')>()),
  readSession: () => cloud.session,
  validSession: async (_f: unknown, s: unknown) => s,
  pullState: async () => ({ data: {
      debts: [{ id: 'c1', name: 'Nuvem', kind: 'receivable', principal: 10, rate: 0, interestType: 'composto', installments: 1, days: 30, date: '2020-01-01', dueDay: 1, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '' }],
      contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [],
    }, settings: {}, updatedAt: '2026-01-01T00:00:00Z' }),
}))

const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30,
  date: '2020-01-01', dueDay: 1, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)

function seed(extra: Record<string, unknown> = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt()], budgets: { Mercado: 500 }, goals: [{ id: 'g1' }], ...extra }))
}

function mount(path = '/pessoas/ana%20souza') {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/pessoas" element={<Pessoas />} />
            <Route path="/pessoas/:id" element={<Pessoas />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </DataProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  cloud.session = null
  // jsdom não implementa <dialog>: abre/fecha pelo atributo `open`
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())
configure({ asyncUtilTimeout: 5000 })

describe('Pessoas: escrita', () => {
  it('"Recebi" registra o pagamento e preserva os campos desconhecidos', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Recebi/ }))
    await waitFor(() => expect(stored().debts[0].payments).toHaveLength(1))
    const out = stored()
    expect(out.debts[0].payments[0]).toMatchObject({ amount: 100, mode: 'fifo' })
    expect(out.budgets).toEqual({ Mercado: 500 })
    expect(out.goals).toEqual([{ id: 'g1' }])
    // dívida quitada: some o botão de pagamento rápido
    await waitFor(() => expect(screen.queryByRole('button', { name: /Recebi/ })).toBeNull())
  })

  it('"Desfazer" volta ao estado anterior', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Recebi/ }))
    await waitFor(() => expect(stored().debts[0].payments).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().debts[0].payments).toHaveLength(0))
  })

  it('"Nova dívida" valida e grava', async () => {
    seed()
    mount('/pessoas')
    fireEvent.click(await screen.findByRole('button', { name: /Nova dívida/ }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    fireEvent.click(within(dlg).getByRole('button', { name: 'Adicionar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/nome do amigo/)
    fireEvent.change(within(dlg).getByLabelText('Nome do amigo'), { target: { value: 'Bruno' } })
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '1.250,50' } })
    fireEvent.change(within(dlg).getByLabelText('Parcelas'), { target: { value: '5' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(stored().debts).toHaveLength(2))
    expect(stored().debts[1]).toMatchObject({ name: 'Bruno', principal: 1250.5, installments: 5, kind: 'receivable', payments: [] })
    expect(stored().budgets).toEqual({ Mercado: 500 })
  })

  it('excluir dívida pede confirmação', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Excluir dívida de Ana Souza/ }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    expect(stored().debts).toHaveLength(1)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().debts).toHaveLength(0))
  })

  it('com a conta ativa continua editando neste aparelho (sincronização falhando não bloqueia)', async () => {
    seed()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    cloud.session = { access: 'a', refresh: 'r', exp: 9999999999, uid: 'u', email: 'a@b.com' }
    mount('/pessoas')
    expect(await screen.findByRole('button', { name: /Nova dívida/ })).toBeTruthy()
    expect(screen.queryByText(/saia da conta/)).toBeNull()
  })
})
