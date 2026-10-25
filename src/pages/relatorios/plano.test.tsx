// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider, useAppData } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { toISO } from '@/lib/finance/dates'
import { STORAGE_KEY } from '@/lib/storage'
import { TxFormDialog } from '@/pages/carteiras/dialogs'
import { Relatorios } from './Relatorios'

const TODAY = toISO(new Date())
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
// o formulário lê a carteira inicial só na montagem: espera os dados carregarem
function WhenReady({ children }: { children: React.ReactNode }) {
  return useAppData().result ? <>{children}</> : null
}
const openDialog =() => document.querySelector<HTMLElement>('dialog[open]')!

function seed(extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      debts: [],
      wallets: [{ id: 'w1', name: 'Nubank', icon: 'landmark' }],
      transactions: [
        { id: 't1', walletId: 'w1', type: 'gasto', amount: 120, date: TODAY, category: 'Mercado', note: '' },
        { id: 't2', walletId: 'w1', type: 'entrada', amount: 1000, date: TODAY, category: 'Salário', note: '' },
      ],
      shares: { tok: { type: 'person' } },
      tgLog: { x: { at: TODAY } },
      ...extra,
    }),
  )
}

function mountRel() {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/relatorios']}>
          <Routes>
            <Route path="/relatorios" element={<Relatorios />} />
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
  configure({ asyncUtilTimeout: 8000 })
})
afterEach(cleanup)

describe('Relatórios: planejamento', () => {
  it('orçamento: define um limite, mostra o gasto e preserva as outras chaves', async () => {
    seed()
    mountRel()
    fireEvent.click(await screen.findByRole('button', { name: /Definir/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Outra categoria'), { target: { value: 'Mercado' } })
    fireEvent.change(within(dlg).getByLabelText('Limite (R$)'), { target: { value: '100' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar orçamento' }))
    await waitFor(() => expect(stored().budgets).toEqual({ Mercado: 100 }))
    expect(stored().shares).toEqual({ tok: { type: 'person' } })
    expect(stored().tgLog).toEqual({ x: { at: TODAY } })
    // 120 de 100: estourou
    expect(await screen.findByText(/Passou/)).toBeTruthy()
  })

  it('orçamento: categoria nova sem limite mostra erro', async () => {
    seed()
    mountRel()
    fireEvent.click(await screen.findByRole('button', { name: /Definir/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Outra categoria'), { target: { value: 'Viagem' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar orçamento' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/Informe o limite/)
    expect(stored().budgets).toBeUndefined()
  })

  it('metas: cria, guarda, retira e exclui', async () => {
    seed()
    mountRel()
    fireEvent.click(await screen.findByRole('button', { name: /Nova meta/ }))
    let dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar meta' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/nome/)
    fireEvent.change(within(dlg).getByLabelText('Nome da meta'), { target: { value: 'Viagem' } })
    fireEvent.change(within(dlg).getByLabelText('Quanto quer juntar (R$)'), { target: { value: '1.000' } })
    fireEvent.change(within(dlg).getByLabelText('Já tenho guardado (opcional)'), { target: { value: '100' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar meta' }))
    await waitFor(() => expect(stored().goals).toHaveLength(1))
    expect(stored().goals[0]).toMatchObject({ name: 'Viagem', target: 1000, walletId: '' })
    expect(stored().goals[0].adds[0]).toMatchObject({ amount: 100, note: 'saldo inicial' })
    expect(stored().shares).toEqual({ tok: { type: 'person' } })

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '250' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(stored().goals[0].adds).toHaveLength(2))
    expect(stored().goals[0].adds[1].amount).toBe(250)

    fireEvent.click(await screen.findByRole('button', { name: 'Retirar' }))
    dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '9999' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Retirar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/Só tem/)
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '50' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Retirar' }))
    await waitFor(() => expect(stored().goals[0].adds).toHaveLength(3))
    expect(stored().goals[0].adds[2].amount).toBe(-50)

    fireEvent.click(await screen.findByRole('button', { name: /Editar meta Viagem/ }))
    dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Excluir meta' }))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().goals).toHaveLength(0))
  })

  it('meta inválida no armazenamento não é apagada ao mexer em outra', async () => {
    seed({ goals: [{ id: 'lixo' }, { id: 'g1', name: 'A', target: 100, deadline: '', walletId: '', adds: [] }] })
    mountRel()
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '10' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(stored().goals[1].adds).toHaveLength(1))
    expect(stored().goals[0]).toEqual({ id: 'lixo' })
  })

  it('recorrente: cria e já lança os meses que venceram', async () => {
    seed()
    mountRel()
    fireEvent.click(await screen.findByRole('button', { name: /Novo recorrente/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '30' } })
    fireEvent.change(within(dlg).getByLabelText('Categoria'), { target: { value: 'Assinaturas' } })
    fireEvent.change(within(dlg).getByLabelText('Todo dia'), { target: { value: '1' } })
    fireEvent.change(within(dlg).getByLabelText('Nota (opcional)'), { target: { value: 'Spotify' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(stored().recurring).toHaveLength(1))
    const r = stored().recurring[0]
    expect(r).toMatchObject({ type: 'gasto', amount: 30, day: 1, walletId: 'w1', note: 'Spotify', active: true })
    const month = TODAY.slice(0, 7)
    // dia 1 do mês de hoje já passou: um lançamento automático
    const auto = stored().transactions.filter((t: { auto?: string }) => t.auto?.startsWith('rec:' + r.id))
    expect(auto).toHaveLength(1)
    expect(auto[0]).toMatchObject({ date: month + '-01', amount: 30, category: 'Assinaturas' })
    expect(r.posted[month]).toBe(auto[0].id)
  })

  it('ao abrir, lança sozinho o recorrente que venceu e não duplica', async () => {
    const month = TODAY.slice(0, 7)
    seed({ recurring: [{ id: 'r1', type: 'gasto', amount: 15, category: 'Academia', day: 1, walletId: 'w1', start: month, active: true, posted: {} }] })
    mountRel()
    await waitFor(() => expect(stored().transactions.filter((t: { auto?: string }) => t.auto?.startsWith('rec:r1'))).toHaveLength(1))
    await screen.findByText('Academia')
    expect(stored().transactions.filter((t: { auto?: string }) => t.auto?.startsWith('rec:r1'))).toHaveLength(1)
    expect(stored().shares).toEqual({ tok: { type: 'person' } })
  })
})

describe('Carteiras: Repetir todo mês', () => {
  it('lançamento novo com "Repetir" cria o recorrente com o mês já marcado', async () => {
    seed()
    render(
      <DataProvider>
        <ToastProvider>
          <WhenReady>
            <TxFormDialog open onClose={() => {}} walletId="w1" />
          </WhenReady>
        </ToastProvider>
      </DataProvider>,
    )
    const dlg = await waitFor(() => {
      const d = openDialog()
      expect(d).toBeTruthy()
      return d
    })
    await within(dlg).findByLabelText('Valor (R$)')
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '80' } })
    fireEvent.change(within(dlg).getByLabelText('Categoria'), { target: { value: 'Academia' } })
    fireEvent.click(within(dlg).getByLabelText('Repetir todo mês, no mesmo dia'))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar lançamento' }))
    await waitFor(() => expect(stored().recurring).toHaveLength(1))
    const r = stored().recurring[0]
    const tx = stored().transactions.find((t: { category?: string }) => t.category === 'Academia')
    expect(tx.auto).toBe('rec:' + r.id + ':' + TODAY.slice(0, 7))
    expect(r.posted[TODAY.slice(0, 7)]).toBe(tx.id)
    expect(r).toMatchObject({ amount: 80, walletId: 'w1', day: Number(TODAY.slice(8, 10)) })
    expect(stored().shares).toEqual({ tok: { type: 'person' } })
  })
})
