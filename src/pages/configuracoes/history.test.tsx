// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { readHistory, recordChange } from '@/lib/history'
import { HistorySection } from './history'

const d = (id: string, principal: number) => ({ id, name: 'Ana', principal, payments: [] })
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)
const mount = () =>
  render(
    <ToastProvider>
      <HistorySection />
    </ToastProvider>,
  )

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('Configurações: histórico de alterações', () => {
  it('vazio: explica', () => {
    mount()
    expect(screen.getByText(/Nada por aqui ainda/)).toBeTruthy()
  })

  it('lista a mais nova primeiro e o Desfazer volta os dados e marca como desfeita', async () => {
    const v0 = { debts: [d('a', 100)] }
    const v1 = { debts: [d('a', 150)] }
    const v2 = { debts: [d('a', 150), d('b', 20)] }
    recordChange('Dívida editada', JSON.stringify(v0), JSON.stringify(v1))
    recordChange('Dívida criada', JSON.stringify(v1), JSON.stringify(v2))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v2))
    mount()
    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toContain('Dívida criada')
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer: Dívida criada' }))
    expect(await screen.findByText('Alteração desfeita.')).toBeTruthy()
    expect(stored()).toEqual(v1)
    expect(screen.getByText('Desfeita')).toBeTruthy()
    expect(readHistory().filter((e) => e.undone)).toHaveLength(1)
  })

  it('avisa e não mexe quando o dado foi alterado depois', async () => {
    const v0 = { debts: [d('a', 100)] }
    const v1 = { debts: [d('a', 150)] }
    recordChange('Dívida editada', JSON.stringify(v0), JSON.stringify(v1))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [d('a', 999)] }))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer: Dívida editada' }))
    expect(await screen.findByText(/foi alterado depois/)).toBeTruthy()
    expect(stored().debts[0].principal).toBe(999)
  })

  it('"Limpar histórico" esvazia a lista sem mexer nos dados', () => {
    const v1 = { debts: [d('a', 150)] }
    recordChange('x', JSON.stringify({ debts: [] }), JSON.stringify(v1))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar histórico' }))
    expect(readHistory()).toEqual([])
    expect(stored()).toEqual(v1)
  })
})
