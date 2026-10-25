// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { createReceiptStore, receiptIdOf } from '@/lib/receipts/store'
import { memoryKV } from '@/lib/receipts/kv'
import { STORAGE_KEY } from '@/lib/storage'
import { Pessoas } from './Pessoas'
import { actionNames, clickAction } from '@/test-menu'

const IMG = 'data:image/jpeg;base64,AAAA'
const mem = vi.hoisted(() => ({ kv: null as unknown }))

vi.mock('@/lib/receipts/image', () => ({ compressImage: async () => 'data:image/jpeg;base64,AAAA', fitSize: () => ({ w: 1, h: 1 }) }))
vi.mock('@/lib/receipts/store', async (orig) => {
  const real = await orig<typeof import('@/lib/receipts/store')>()
  return { ...real, receiptStore: () => mem.kv }
})
const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30,
  date: '2020-01-01', dueDay: 1, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const seed = (d: Record<string, unknown>) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [d], budgets: { Mercado: 500 } }))

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

const openHistory = async () => fireEvent.click(await screen.findByRole('tab', { name: /Histórico/ }))
const win = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } }

beforeEach(() => {
  localStorage.clear()
  mem.kv = createReceiptStore(memoryKV())
  win.document.write.mockClear()
  window.open = vi.fn(() => win as never)
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

const PAID = { payments: [{ id: 'p1', date: '2020-02-01', amount: 100, mode: 'fifo' }] }

describe('Pessoas: comprovantes', () => {
  it('anexa a foto: guarda no IndexedDB e só o id no pagamento', async () => {
    seed(debt(PAID))
    mount()
    await openHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Anexar comprovante' }))
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    fireEvent.change(input, { target: { files: [new File(['x'], 'foto.png', { type: 'image/png' })] } })
    await waitFor(() => expect(receiptIdOf(stored().debts[0].payments[0])).toMatch(/^rc-/))
    const id = receiptIdOf(stored().debts[0].payments[0])!
    expect(await (mem.kv as ReturnType<typeof createReceiptStore>).get(id)).toBe(IMG)
    expect(JSON.stringify(stored())).not.toContain('base64')
    expect(stored().budgets).toEqual({ Mercado: 500 })
    expect(await screen.findByRole('button', { name: 'Ver comprovante' })).toBeTruthy()
  })

  it('vê a foto e remove (a foto sai do pagamento)', async () => {
    seed(debt({ payments: [{ id: 'p1', date: '2020-02-01', amount: 100, mode: 'fifo', receiptId: 'rc-1' }] }))
    await (mem.kv as ReturnType<typeof createReceiptStore>).put('rc-1', IMG)
    mount()
    await openHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprovante' }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    const img = await within(dlg).findByAltText('Comprovante do pagamento')
    expect(img.getAttribute('src')).toBe(IMG)
    fireEvent.click(within(dlg).getByRole('button', { name: /Remover/ }))
    await waitFor(() => expect(receiptIdOf(stored().debts[0].payments[0])).toBeUndefined())
  })

  it('foto de outro aparelho: avisa que não está aqui', async () => {
    seed(debt({ payments: [{ id: 'p1', date: '2020-02-01', amount: 100, mode: 'fifo', receiptId: 'rc-tg-9' }] }))
    mount()
    await openHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Ver comprovante' }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    expect(await within(dlg).findByText(/não está neste aparelho/)).toBeTruthy()
  })
})

describe('Pessoas: documentos', () => {
  it('Extrato abre a página imprimível com o nome escapado', async () => {
    seed(debt({ name: 'Ana <b>Souza</b>' }))
    mount('/pessoas/' + encodeURIComponent('ana <b>souza</b>'))
    await clickAction('Extrato')
    expect(window.open).toHaveBeenCalled()
    const html = win.document.write.mock.calls[0][0] as string
    expect(html).toContain('Extrato de Empréstimo')
    expect(html).toContain('Ana &lt;b&gt;Souza&lt;/b&gt;')
    expect(html).not.toContain('<b>Souza</b>')
  })

  it('Recibo só na dívida quitada', async () => {
    seed(debt())
    mount()
    expect(await actionNames()).not.toContain('Recibo de quitação')
    expect(screen.queryByRole('button', { name: /Recibo de quitação/ })).toBeNull()
    cleanup()
    localStorage.clear()
    seed(debt(PAID))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Recibo de quitação/ }))
    const html = win.document.write.mock.calls[0][0] as string
    expect(html).toContain('RECIBO DE QUITAÇÃO')
    expect(html).toContain('cem reais')
  })

  it('janela bloqueada mostra aviso', async () => {
    seed(debt())
    window.open = vi.fn(() => null)
    mount()
    await clickAction('Extrato')
    expect(await screen.findByText(/bloqueou a nova janela/)).toBeTruthy()
  })

  it('Ranking abre a página dos pagadores', async () => {
    seed(debt(PAID))
    mount('/pessoas')
    fireEvent.click(await screen.findByRole('button', { name: 'Ranking' }))
    expect((win.document.write.mock.calls[0][0] as string)).toContain('Ranking dos Pagadores')
  })

  it('sem dados do aparelho (demonstração, só leitura) extrato fica e edição some', async () => {
    mount('/pessoas/ana%20souza')
    await clickAction('Extrato')
    expect(win.document.write).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /Recebi/ })).toBeNull()
    expect(await actionNames()).not.toContain('Editar')
  })
})
