// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { Carteiras } from '@/pages/carteiras/Carteiras'
import { AppShell } from './AppShell'
import { DataProvider } from './data-context'
import { HIDE_KEY } from './hide-values'
import { choose } from '@/test-select'

const dlg = () => document.querySelector<HTMLElement>('dialog[open]')

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname}</output>
}

function seed() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      debts: [{ id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30, date: '2026-01-01', dueDay: 1, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '' }],
      wallets: [{ id: 'w1', name: 'Nubank', icon: 'landmark' }],
      transactions: [{ id: 't1', walletId: 'w1', type: 'entrada', amount: 1234.5, date: '2026-01-02', category: 'Salário' }],
    }),
  )
}

function mount(path = '/carteiras') {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="carteiras" element={<Carteiras />} />
              <Route path="carteiras/:id" element={<Where />} />
              <Route path="pessoas/:id" element={<Where />} />
              <Route path="pessoas" element={<Where />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </DataProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  seed()
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  Element.prototype.scrollIntoView = () => {}
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

describe('olhinho', () => {
  it('esconde os valores, lembra a escolha e mostra de novo', async () => {
    mount()
    await screen.findAllByText(/1\.234,50/)
    const eye = screen.getByRole('button', { name: 'Esconder valores' })
    expect(eye.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(eye)
    await waitFor(() => expect(screen.queryByText(/1\.234,50/)).toBeNull())
    expect(screen.getAllByText(/R\$ •••••/).length).toBeGreaterThan(0)
    expect(localStorage.getItem(HIDE_KEY)).toBe('1')
    const back = screen.getByRole('button', { name: 'Mostrar valores' })
    expect(back.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(back)
    await screen.findAllByText(/1\.234,50/)
    expect(localStorage.getItem(HIDE_KEY)).toBe('0')
  })

  it('começa escondido quando a escolha já estava salva', async () => {
    localStorage.setItem(HIDE_KEY, '1')
    mount()
    await screen.findByRole('button', { name: 'Mostrar valores' })
    expect(screen.queryByText(/1\.234,50/)).toBeNull()
  })
})

describe('busca', () => {
  it('botão abre a busca; achar e Enter leva até a pessoa', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar' }))
    const d = dlg()!
    expect(within(d).getByText(/Busque por pessoa/)).toBeTruthy()
    fireEvent.change(within(d).getByRole('combobox'), { target: { value: 'ana' } })
    expect(await within(d).findByRole('option', { name: /Ana Souza/ })).toBeTruthy()
    fireEvent.keyDown(within(d).getByRole('combobox'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/pessoas/ana%20souza'))
    expect(dlg()).toBeNull()
  })

  it('setas escolhem o resultado; sem resultado mostra aviso', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar' }))
    const box = within(dlg()!).getByRole('combobox')
    fireEvent.change(box, { target: { value: 'nubank' } })
    const opt = await within(dlg()!).findByRole('option', { name: /Nubank/ })
    expect(opt.getAttribute('aria-selected')).toBe('true')
    fireEvent.change(box, { target: { value: 'zzzzzz' } })
    expect(await within(dlg()!).findByText(/Nada encontrado/)).toBeTruthy()
  })

  it('busca por valor acha o lançamento', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Buscar' }))
    fireEvent.change(within(dlg()!).getByRole('combobox'), { target: { value: '1.234,50' } })
    expect(await within(dlg()!).findByRole('option', { name: /Salário/ })).toBeTruthy()
  })

  it('Ctrl+K e "/" abrem; "/" digitando num campo não abre', async () => {
    mount()
    await screen.findByRole('button', { name: 'Buscar' })
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    await waitFor(() => expect(dlg()).toBeTruthy())
    cleanup()
    mount()
    await screen.findByRole('button', { name: 'Buscar' })
    expect(dlg()).toBeNull()
    fireEvent.keyDown(document.body, { key: '/' })
    await waitFor(() => expect(dlg()).toBeTruthy())
  })

  it('"/" dentro de um campo de texto não abre a busca', async () => {
    mount()
    const input = document.createElement('input')
    document.body.appendChild(input)
    await screen.findByRole('button', { name: 'Buscar' })
    fireEvent.keyDown(input, { key: '/' })
    expect(dlg()).toBeNull()
    input.remove()
  })
})

describe('simulador de empréstimo', () => {
  it('calcula parcela, total e juros e mostra a conta', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Simulador de empréstimo' }))
    const d = dlg()!
    // padrão: R$ 100, 10% ao mês, 1 parcela, juros compostos
    expect(within(d).getByText('Parcela (1x)').nextElementSibling?.textContent).toMatch(/110,00/)
    fireEvent.change(within(d).getByLabelText('Número de parcelas'), { target: { value: '3' } })
    await waitFor(() => expect(within(d).getByText('Total').nextElementSibling?.textContent).toMatch(/133,10/))
    expect(within(d).getByText('Juros').nextElementSibling?.textContent).toMatch(/33,10/)
    expect(within(d).getByText(/× \(1 \+ 10%\)³/)).toBeTruthy()
    choose(within(d).getByLabelText('Tipo de juros'), 'simples')
    await waitFor(() => expect(within(d).getByText('Total').nextElementSibling?.textContent).toMatch(/130,00/))
  })

  it('valores inválidos não quebram a tela', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Simulador de empréstimo' }))
    const d = dlg()!
    fireEvent.change(within(d).getByLabelText('Valor a emprestar (R$)'), { target: { value: 'abc' } })
    fireEvent.change(within(d).getByLabelText('Número de parcelas'), { target: { value: '' } })
    await waitFor(() => expect(within(d).getByText('Total').nextElementSibling?.textContent).toMatch(/0,00/))
  })
})
