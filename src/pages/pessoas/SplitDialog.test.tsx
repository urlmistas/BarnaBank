// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, within } from '@testing-library/react'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { SplitDialog } from './SplitDialog'

const mount = () =>
  render(
    <DataProvider>
      <ToastProvider>
        <SplitDialog open onClose={() => {}} />
      </ToastProvider>
    </DataProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

function addPeople(text: string) {
  fireEvent.change(screen.getByLabelText('Pessoas (separe por vírgula)'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
}

describe('Racha de contas', () => {
  it('só mostra as despesas com pelo menos 2 pessoas; repetidas (sem diferenciar caixa) entram uma vez', () => {
    mount()
    expect(screen.queryByRole('button', { name: 'Adicionar despesa' })).toBeNull()
    addPeople('Ana, ana, Bia')
    expect(within(screen.getByRole('list', { name: 'Pessoas do racha' })).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Adicionar despesa' })).toBeTruthy()
  })

  it('uma despesa paga por Ana dividida entre os três: Bia e Caio pagam a Ana', () => {
    mount()
    addPeople('Ana, Bia, Caio')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '90' } })
    const res = screen.getByRole('region', { name: 'Resultado do racha' })
    expect(res.textContent).toMatch(/Bia\s*paga\s*R\$\s*30,00\s*a\s*Ana/)
    expect(res.textContent).toMatch(/Caio\s*paga\s*R\$\s*30,00\s*a\s*Ana/)
  })

  it('tirar alguém da divisão muda o acerto; sem ninguém marcado volta para todos', () => {
    mount()
    addPeople('Ana, Bia, Caio')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Caio' })) // Caio fora: 45 para Ana e Bia
    const res = screen.getByRole('region', { name: 'Resultado do racha' })
    expect(res.textContent).toMatch(/Bia\s*paga\s*R\$\s*45,00\s*a\s*Ana/)
    expect(res.textContent).not.toMatch(/Caio\s*paga/)
  })

  it('tirar uma pessoa tira as despesas dela da conta e some da divisão', () => {
    mount()
    addPeople('Ana, Bia, Caio')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar despesa' }))
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tirar Caio' }))
    const res = screen.getByRole('region', { name: 'Resultado do racha' })
    expect(res.textContent).toMatch(/Bia\s*paga\s*R\$\s*30,00\s*a\s*Ana/)
    expect(res.textContent).not.toMatch(/Caio/)
  })
})
