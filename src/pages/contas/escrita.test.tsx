// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { toISO, ymOf } from '@/lib/finance/dates'
import { STORAGE_KEY } from '@/lib/storage'
import { Contas } from './Contas'

const cloud = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }))
vi.mock('@/lib/cloud', async (orig) => ({
  ...(await orig<typeof import('@/lib/cloud')>()),
  readSession: () => cloud.session,
  validSession: async (_f: unknown, s: unknown) => s,
  pullState: async () => ({
    data: {
      debts: [], contacts: {}, wallets: [], transactions: [], groups: [], cardPurchases: [], cardPayments: [], cards: [],
      bills: [{ id: 'bn', name: 'Nuvem', amount: 10, kind: 'gasto', dueDay: 1, startMonth: '2020-01', paid: {} }],
    },
    settings: {},
    updatedAt: '2026-01-01T00:00:00Z',
  }),
}))

const TODAY = toISO(new Date())
const KEY = ymOf(TODAY)
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const openDialog = () => document.querySelector<HTMLElement>('dialog[open]')!

function seed(extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      debts: [],
      wallets: [{ id: 'w1', name: 'Nubank' }],
      transactions: [],
      bills: [{ id: 'b1', name: 'Internet', amount: 100, kind: 'gasto', dueDay: 1, startMonth: '2020-01', paid: {} }],
      cards: [{ id: 'c1', name: 'Roxinho', closingDay: 31, dueDay: 31, limit: 1000 }],
      cardPurchases: [{ id: 'p1', cardId: 'c1', desc: 'Mercado', amount: 200, installments: 1, date: TODAY }],
      cardPayments: [],
      budgets: { Mercado: 500 },
      goals: [{ id: 'g1' }],
      ...extra,
    }),
  )
}

function mount(path: string) {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/contas" element={<Contas />} />
            <Route path="/contas/:id" element={<Contas />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </DataProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  cloud.session = null
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
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

describe('Contas: escrita', () => {
  it('marcar a conta fixa como paga lança na carteira e preserva os campos desconhecidos; Desfazer marcação volta', async () => {
    seed()
    mount('/contas/fixa-b1')
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como paga' }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Carteira'), { target: { value: 'w1' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Marcar como paga' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(1))
    const out = stored()
    expect(out.transactions[0]).toMatchObject({ walletId: 'w1', type: 'gasto', amount: 100, auto: `bill:b1:${KEY}` })
    expect(out.bills[0].paid[KEY]).toBe(out.transactions[0].id)
    expect(out.budgets).toEqual({ Mercado: 500 })
    expect(out.goals).toEqual([{ id: 'g1' }])

    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer marcação' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(0))
    expect(stored().bills[0].paid[KEY]).toBeUndefined()
  })

  it('"Desfazer" do aviso volta ao estado anterior', async () => {
    seed()
    mount('/contas/fixa-b1')
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar como paga' }))
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Marcar como paga' }))
    await waitFor(() => expect(stored().bills[0].paid[KEY]).toBe('x'))
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().bills[0].paid[KEY]).toBeUndefined())
  })

  it('"Nova conta fixa" valida e grava', async () => {
    seed()
    mount('/contas')
    fireEvent.click(await screen.findByRole('button', { name: /Nova conta fixa/ }))
    const dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/nome/)
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'Luz' } })
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '89,90' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(stored().bills).toHaveLength(2))
    expect(stored().bills[1]).toMatchObject({ name: 'Luz', amount: 89.9, kind: 'gasto', active: true, paid: {} })
    expect(stored().budgets).toEqual({ Mercado: 500 })
  })

  it('excluir conta fixa pede confirmação', async () => {
    seed()
    mount('/contas/fixa-b1')
    fireEvent.click(await screen.findByRole('button', { name: /Excluir conta fixa Internet/ }))
    expect(stored().bills).toHaveLength(1)
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().bills).toHaveLength(0))
  })

  it('"Novo cartão" grava', async () => {
    seed()
    mount('/contas')
    fireEvent.click(await screen.findByRole('button', { name: /Novo cartão/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Nome do cartão'), { target: { value: 'Inter' } })
    fireEvent.change(within(dlg).getByLabelText('Limite (R$)'), { target: { value: '2.500' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar cartão' }))
    await waitFor(() => expect(stored().cards).toHaveLength(2))
    expect(stored().cards[1]).toMatchObject({ name: 'Inter', limit: 2500, closingDay: 5, dueDay: 12 })
  })

  it('compra no cartão com parcelas', async () => {
    seed()
    mount('/contas/cartao-c1')
    fireEvent.click(await screen.findByRole('button', { name: /Compra/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Descrição'), { target: { value: 'Tênis' } })
    fireEvent.change(within(dlg).getByLabelText('Valor total (R$)'), { target: { value: '300' } })
    fireEvent.change(within(dlg).getByLabelText('Parcelas'), { target: { value: '3' } })
    expect(within(dlg).getByText(/Entra na fatura de/).textContent).toMatch(/3x de/)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Adicionar compra' }))
    await waitFor(() => expect(stored().cardPurchases).toHaveLength(2))
    expect(stored().cardPurchases[1]).toMatchObject({ cardId: 'c1', desc: 'Tênis', amount: 300, installments: 3 })
  })

  it('pagar fatura cria o pagamento e a saída na carteira', async () => {
    seed()
    mount('/contas/cartao-c1')
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar fatura' }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Carteira'), { target: { value: 'w1' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Registrar pagamento' }))
    await waitFor(() => expect(stored().cardPayments).toHaveLength(1))
    const out = stored()
    expect(out.cardPayments[0]).toMatchObject({ cardId: 'c1', invoice: KEY, amount: 200, txId: out.transactions[0].id })
    expect(out.transactions[0]).toMatchObject({ walletId: 'w1', type: 'gasto', amount: 200, category: 'Cartão de crédito', auto: 'card:' + out.cardPayments[0].id })
    // fatura quitada: some o botão
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Pagar fatura' })).toBeNull())
  })

  it('excluir compra tira a compra', async () => {
    seed()
    mount('/contas/cartao-c1')
    fireEvent.click(await screen.findByRole('button', { name: /Excluir compra Mercado/ }))
    await waitFor(() => expect(stored().cardPurchases).toHaveLength(0))
  })

  it('excluir cartão leva as compras', async () => {
    seed()
    mount('/contas/cartao-c1')
    fireEvent.click(await screen.findByRole('button', { name: /Excluir cartão Roxinho/ }))
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().cards).toHaveLength(0))
    expect(stored().cardPurchases).toHaveLength(0)
  })

  it('com a conta ativa continua editando neste aparelho (sincronização falhando não bloqueia)', async () => {
    seed()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    cloud.session = { access: 'a', refresh: 'r', exp: 9999999999, uid: 'u', email: 'a@b.com' }
    mount('/contas')
    expect(await screen.findByRole('button', { name: /Nova conta fixa/ })).toBeTruthy()
  })
})
