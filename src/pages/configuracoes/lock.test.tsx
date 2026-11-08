// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import { checkPin, readLock } from '@/lib/lock'
import { LockSection } from './lock'

const mount = () =>
  render(
    <ToastProvider>
      <LockSection />
    </ToastProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

describe('Configurações: bloqueio do app', () => {
  it('ligar: pede PIN de 4 a 8 números, confere os dois e grava só o hash', async () => {
    mount()
    expect(readLock()).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Bloquear com PIN' }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    const pin = dlg.querySelector<HTMLInputElement>('input[type=password]')!
    const inputs = dlg.querySelectorAll<HTMLInputElement>('input[type=password]')
    fireEvent.change(pin, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    expect(await screen.findByText('O PIN tem de 4 a 8 números.')).toBeTruthy()
    fireEvent.change(inputs[0], { target: { value: '4821' } })
    fireEvent.change(inputs[1], { target: { value: '4822' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    expect(await screen.findByText('Os dois PINs não são iguais.')).toBeTruthy()
    fireEvent.change(inputs[1], { target: { value: '4821' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    await waitFor(() => expect(readLock()).not.toBeNull())
    expect(localStorage.getItem('bbweb_lock')).not.toContain('4821')
    expect(await checkPin(readLock()!, '4821')).toBe(true)
    expect(screen.getByRole('switch', { name: 'Bloquear com PIN' }).getAttribute('aria-checked')).toBe('true')
  })

  it('ligado: muda o tempo para trancar de novo e desliga', async () => {
    mount()
    fireEvent.click(screen.getByRole('switch', { name: 'Bloquear com PIN' }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    for (const i of dlg.querySelectorAll<HTMLInputElement>('input[type=password]')) fireEvent.change(i, { target: { value: '9090' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    await waitFor(() => expect(readLock()).not.toBeNull())
    expect(readLock()!.after).toBe(0)
    fireEvent.click(screen.getByRole('switch', { name: 'Bloquear com PIN' }))
    await waitFor(() => expect(readLock()).toBeNull())
  })
})
