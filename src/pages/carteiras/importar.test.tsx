// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { choose } from '@/test-select'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { Carteiras } from './Carteiras'

const OFX = `OFXHEADER:100
<OFX><STMTTRN><DTPOSTED>20260305120000<TRNAMT>-45,90<FITID>abc1<MEMO>Compra IFOOD Restaurante</STMTTRN>
<STMTTRN><DTPOSTED>20260306<TRNAMT>1500.00<FITID>abc2<NAME>Salario Empresa</STMTTRN></OFX>`

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const dlg = () => document.querySelector<HTMLElement>('dialog[open]')!

function seed(extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      debts: [],
      wallets: [{ id: 'w1', name: 'Nubank', icon: 'landmark' }],
      cards: [{ id: 'c1', name: 'Roxinho', closingDay: 5, dueDay: 12, limit: 3000 }],
      transactions: [],
      budgets: { Mercado: 500 },
      ...extra,
    }),
  )
}

function mount() {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/carteiras']}>
          <Routes>
            <Route path="/carteiras" element={<Carteiras />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </DataProvider>,
  )
}

async function pickFile(content: string, name = 'extrato.ofx') {
  fireEvent.click(await screen.findByRole('button', { name: /Importar extrato/ }))
  const input = screen.getByLabelText('Arquivo do extrato') as HTMLInputElement
  const file = new File([content], name, { type: 'text/plain' })
  fireEvent.change(input, { target: { files: [file] } })
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
  HTMLInputElement.prototype.click = function () {}
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

describe('Carteiras: importar extrato', () => {
  it('mostra a prévia, importa as linhas marcadas e preserva os campos desconhecidos', async () => {
    seed()
    mount()
    await pickFile(OFX)
    const d = await waitFor(() => {
      const el = dlg()
      expect(el).toBeTruthy()
      return el
    })
    expect(within(d).getByText(/2 lançamentos/)).toBeTruthy()
    expect(within(d).getByText('2 de 2 marcados')).toBeTruthy()
    // a categoria sugerida vem das regras embutidas
    expect((within(d).getByLabelText('Categoria de Compra IFOOD Restaurante') as HTMLInputElement).value).toBe('Alimentação')
    fireEvent.click(within(d).getByRole('button', { name: 'Importar 2' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(2))
    const tx = stored().transactions as { type: string; amount: number; walletId: string; imp: string; category: string }[]
    expect(tx.find((t) => t.type === 'gasto')).toMatchObject({ amount: 45.9, walletId: 'w1', imp: 'f:abc1', category: 'Alimentação' })
    expect(tx.find((t) => t.type === 'entrada')).toMatchObject({ amount: 1500, imp: 'f:abc2' })
    expect(stored().budgets).toEqual({ Mercado: 500 })
  })

  it('importar de novo o mesmo arquivo não duplica: tudo vem como "já importado"', async () => {
    seed()
    mount()
    await pickFile(OFX)
    await waitFor(() => expect(dlg()).toBeTruthy())
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Importar 2' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(2))
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull())

    await pickFile(OFX)
    await waitFor(() => expect(dlg()).toBeTruthy())
    expect(within(dlg()).getAllByText(/já importado/)).toHaveLength(2)
    expect(within(dlg()).getByText('0 de 2 marcados')).toBeTruthy()
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Importar 0' }))
    expect((await within(dlg()).findByRole('alert')).textContent).toMatch(/Nenhum lançamento marcado/)
    expect(stored().transactions).toHaveLength(2)
  })

  it('corrigir a categoria grava uma regra aprendida; "Desfazer" volta tudo', async () => {
    seed({ catRules: { velha: 'Lazer' } })
    mount()
    await pickFile(OFX)
    await waitFor(() => expect(dlg()).toBeTruthy())
    const cat = within(dlg()).getByLabelText('Categoria de Salario Empresa') as HTMLInputElement
    fireEvent.change(cat, { target: { value: 'Trabalho' } })
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Importar 2' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(2))
    expect(stored().catRules).toMatchObject({ velha: 'Lazer', 'salario empresa': 'Trabalho' })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().transactions).toHaveLength(0))
    expect(stored().catRules).toEqual({ velha: 'Lazer' })
  })

  it('no cartão, só gasto vira compra', async () => {
    seed()
    mount()
    await pickFile(OFX)
    await waitFor(() => expect(dlg()).toBeTruthy())
    choose(within(dlg()).getByLabelText('Para onde'), 'c:c1')
    // a entrada de 1.500 não entra como compra
    await waitFor(() => expect(within(dlg()).getByText('1 de 2 marcados')).toBeTruthy())
    fireEvent.click(within(dlg()).getByRole('button', { name: 'Importar 1' }))
    await waitFor(() => expect(stored().cardPurchases).toHaveLength(1))
    expect(stored().cardPurchases[0]).toMatchObject({ cardId: 'c1', amount: 45.9, installments: 1, imp: 'f:abc1' })
    expect(stored().transactions).toHaveLength(0)
  })

  it('arquivo que não é extrato avisa e não abre a prévia', async () => {
    seed()
    mount()
    await pickFile('isso não é um extrato', 'foto.txt')
    await screen.findByText(/Não consegui ler esse arquivo/)
    expect(document.querySelector('dialog[open]')).toBeNull()
  })
})
