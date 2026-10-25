// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { toISO } from '@/lib/finance/dates'
import { STORAGE_KEY } from '@/lib/storage'
import { Contas } from './Contas'
import { choose } from '@/test-select'

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const dlg = () => document.querySelector<HTMLElement>('dialog[open]')!
const TODAY = toISO(new Date())

function seed() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      debts: [],
      wallets: [{ id: 'w1', name: 'Nubank', icon: 'landmark' }],
      transactions: [{ id: 't1', walletId: 'w1', type: 'entrada', amount: 5000, date: TODAY, category: 'Salário' }],
      bills: [{ id: 'b1', name: 'Aluguel', amount: 1000, kind: 'gasto', dueDay: 28, paid: {}, category: 'Moradia' }],
      cards: [{ id: 'c1', name: 'Roxinho', closingDay: 5, dueDay: 12, limit: 3000 }],
      goals: [{ id: 'g1' }],
    }),
  )
}

function mount() {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/contas']}>
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
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

describe('Contas: Cabe no mês?', () => {
  it('compra pequena cabe; grande não; registrar à vista cria o gasto', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Cabe no mês\?/ }))
    const d = dlg()
    expect(within(d).getByText('Digite o valor para ver.')).toBeTruthy()
    fireEvent.change(within(d).getByLabelText('Valor total (R$)'), { target: { value: '100' } })
    expect(await within(d).findByText('Cabe!')).toBeTruthy()
    fireEvent.change(within(d).getByLabelText('Valor total (R$)'), { target: { value: '90000' } })
    expect(await within(d).findByText('Não cabe')).toBeTruthy()

    fireEvent.change(within(d).getByLabelText('Valor total (R$)'), { target: { value: '120,50' } })
    fireEvent.change(within(d).getByLabelText('O que é'), { target: { value: 'Fone' } })
    choose(within(d).getByLabelText('Como vai pagar'), 'w:w1')
    fireEvent.click(within(d).getByRole('button', { name: 'Registrar a compra' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(2))
    expect(stored().transactions[1]).toMatchObject({ type: 'gasto', amount: 120.5, category: 'Compras', note: 'Fone', walletId: 'w1' })
    expect(stored().goals).toEqual([{ id: 'g1' }])
  })

  it('no cartão parcelado grava a compra com as parcelas', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Cabe no mês\?/ }))
    const d = dlg()
    fireEvent.change(within(d).getByLabelText('Valor total (R$)'), { target: { value: '600' } })
    fireEvent.change(within(d).getByLabelText('Parcelas'), { target: { value: '3' } })
    choose(within(d).getByLabelText('Como vai pagar'), 'c:c1')
    expect(await within(d).findByText(/3x de/)).toBeTruthy()
    fireEvent.click(within(d).getByRole('button', { name: 'Registrar a compra' }))
    await waitFor(() => expect(stored().cardPurchases).toHaveLength(1))
    expect(stored().cardPurchases[0]).toMatchObject({ cardId: 'c1', amount: 600, installments: 3, date: TODAY })
  })
})

describe('Contas: calendário', () => {
  it('alterna para o calendário, mostra a conta do dia e volta para a lista', async () => {
    seed()
    mount()
    const radio = await screen.findByRole('radio', { name: 'Calendário' })
    fireEvent.click(radio)
    const grid = await screen.findByRole('grid', { name: 'Dias do mês' })
    // a conta vence dia 28 (todo mês tem esse dia, o que muda é só o mês corrente)
    fireEvent.click(within(grid).getByRole('gridcell', { name: /^28 de .*1 item/ }))
    expect(await screen.findByText('Aluguel')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Paguei' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Calendário' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Lista' }))
    await waitFor(() => expect(screen.queryByRole('grid', { name: 'Dias do mês' })).toBeNull())
  })
})
