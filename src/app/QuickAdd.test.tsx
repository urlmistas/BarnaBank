// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, configure, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { QuickAdd } from './QuickAdd'

function mount(data: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter>
          <QuickAdd />
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

describe('botão "+" do celular', () => {
  it('com carteira: oferece gasto/entrada e as duas dívidas, e abre o formulário escolhido', async () => {
    mount({ debts: [], wallets: [{ id: 'w1', name: 'Nubank' }] })
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar' }))
    expect(await screen.findByRole('menuitem', { name: /Gasto ou entrada/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Devo a alguém/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /Emprestei a alguém/ }))
    expect(await screen.findByRole('dialog', { hidden: true })).toBeTruthy()
  })

  it('sem carteira não oferece lançamento, só as dívidas', async () => {
    mount({ debts: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar' }))
    await screen.findByRole('menuitem', { name: /Emprestei a alguém/ })
    expect(screen.queryByRole('menuitem', { name: /Gasto ou entrada/ })).toBeNull()
  })
})
