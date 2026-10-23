// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { toISO } from '@/lib/finance/dates'
import { STORAGE_KEY } from '@/lib/storage'
import { Carteiras } from './Carteiras'

const cloud = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }))
vi.mock('@/lib/cloud', async (orig) => ({
  ...(await orig<typeof import('@/lib/cloud')>()),
  readSession: () => cloud.session,
  validSession: async (_f: unknown, s: unknown) => s,
  pullState: async () => ({
    data: { debts: [], contacts: {}, wallets: [{ id: 'c1', name: 'Da nuvem', icon: 'wallet' }], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [] },
    settings: {},
    updatedAt: '2026-01-01T00:00:00Z',
  }),
}))

// movimentos aparecem no mês de hoje: as datas do cenário usam o dia de hoje
const TODAY = toISO(new Date())

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const openDialog = () => document.querySelector<HTMLElement>('dialog[open]')!

const debt = {
  id: 'd1', name: 'Ana', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30, date: '2020-01-01', dueDay: 1,
  discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', payments: [{ id: 'p1', date: TODAY, amount: 40, mode: 'fifo', walletId: 'w1' }],
}

function seed() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      debts: [debt],
      wallets: [{ id: 'w1', name: 'Nubank', icon: 'landmark' }, { id: 'w2', name: 'Dinheiro', icon: 'banknote' }],
      transactions: [
        { id: 't1', walletId: 'w1', type: 'gasto', amount: 30, date: TODAY, category: 'Mercado', note: '' },
        { id: 't2', walletId: 'w1', toWalletId: 'w2', type: 'transferencia', amount: 15, date: TODAY, category: 'Transferência' },
      ],
      budgets: { Mercado: 500 },
      goals: [{ id: 'g1' }],
    }),
  )
}

function mount(path: string) {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/carteiras" element={<Carteiras />} />
            <Route path="/carteiras/:id" element={<Carteiras />} />
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

describe('Carteiras: escrita', () => {
  it('nova carteira valida o nome, grava com o ícone e preserva campos desconhecidos', async () => {
    seed()
    mount('/carteiras')
    fireEvent.click(await screen.findByRole('button', { name: /Nova carteira/ }))
    const dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toBe('Informe um nome.')
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: ' Poupança ' } })
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Poupança' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(stored().wallets).toHaveLength(3))
    expect(stored().wallets[2]).toMatchObject({ name: 'Poupança', icon: 'piggy-bank' })
    expect(stored().budgets).toEqual({ Mercado: 500 })
    expect(stored().goals).toEqual([{ id: 'g1' }])
  })

  it('novo gasto grava o lançamento e "Desfazer" volta ao estado anterior', async () => {
    seed()
    mount('/carteiras/w1')
    fireEvent.click(await screen.findByRole('button', { name: /^Lançamento$/ }))
    const dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Gasto' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar lançamento' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/maior que zero/)
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '12,50' } })
    fireEvent.change(within(dlg).getByLabelText('Categoria'), { target: { value: 'Lanche' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar lançamento' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(3))
    expect(stored().transactions[2]).toMatchObject({ walletId: 'w1', type: 'gasto', amount: 12.5, category: 'Lanche' })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(2))
  })

  it('transferência exige destino diferente e grava os dois lados num lançamento só', async () => {
    seed()
    mount('/carteiras/w1')
    fireEvent.click(await screen.findByRole('button', { name: /^Lançamento$/ }))
    const dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Transferência' }))
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '20' } })
    // destino padrão = outra carteira (Dinheiro)
    expect((within(dlg).getByLabelText('Para') as HTMLSelectElement).value).toBe('w2')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar lançamento' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(3))
    expect(stored().transactions[2]).toMatchObject({ walletId: 'w1', toWalletId: 'w2', type: 'transferencia', amount: 20, category: 'Transferência' })
  })

  it('editar lançamento troca os campos', async () => {
    seed()
    mount('/carteiras/w1')
    // mais de um lançamento tem "Editar lançamento": o do Mercado é o gasto
    const row = (await screen.findByText('Mercado')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Editar lançamento' }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '45,00' } })
    fireEvent.change(within(dlg).getByLabelText('Categoria'), { target: { value: 'Feira' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(stored().transactions[0]).toMatchObject({ id: 't1', amount: 45, category: 'Feira' }))
  })

  it('excluir lançamento pede confirmação; pagamento de empréstimo não tem botão', async () => {
    seed()
    mount('/carteiras/w1')
    const row = (await screen.findByText('Mercado')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Excluir lançamento' }))
    expect(stored().transactions).toHaveLength(2)
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().transactions.map((t: { id: string }) => t.id)).toEqual(['t2']))
    const loan = screen.getByText('Recebido de Ana').closest('li')!
    expect(within(loan).queryByRole('button', { name: /lançamento/ })).toBeNull()
  })

  it('editar carteira troca nome e ícone', async () => {
    seed()
    mount('/carteiras/w1')
    fireEvent.click(await screen.findByRole('button', { name: 'Editar carteira Nubank' }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'Banco Azul' } })
    fireEvent.click(within(dlg).getByRole('radio', { name: 'Cofre' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(stored().wallets[0]).toMatchObject({ id: 'w1', name: 'Banco Azul', icon: 'vault' }))
  })

  it('excluir carteira apaga os lançamentos dela e solta os pagamentos de empréstimo', async () => {
    seed()
    mount('/carteiras/w1')
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir carteira Nubank' }))
    expect(stored().wallets).toHaveLength(2)
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Excluir carteira' }))
    await waitFor(() => expect(stored().wallets.map((w: { id: string }) => w.id)).toEqual(['w2']))
    expect(stored().transactions).toEqual([])
    expect(stored().debts[0].payments[0].walletId).toBeUndefined()
    expect(stored().debts[0].payments[0].amount).toBe(40)
    expect(stored().budgets).toEqual({ Mercado: 500 })
  })

  it('sem carteiras, oferece criar a primeira', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt] }))
    mount('/carteiras')
    fireEvent.click(await screen.findByRole('button', { name: 'Criar carteira' }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'Dinheiro' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(stored().wallets).toEqual([expect.objectContaining({ name: 'Dinheiro', icon: 'wallet' })]))
    expect(stored().debts).toHaveLength(1)
  })

  it('com a conta ativa continua editando neste aparelho (sincronização falhando não bloqueia)', async () => {
    seed()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    cloud.session = { access: 'a', refresh: 'r', exp: 9999999999, uid: 'u', email: 'a@b.com' }
    mount('/carteiras')
    expect(await screen.findByRole('button', { name: /Nova carteira/ })).toBeTruthy()
  })
})
