// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { LOCK_KEY, makeLock, readLock, writeLock, type LockAfter } from '@/lib/lock'
import { LockGate } from './LockGate'

const mount = () =>
  render(
    <DataProvider>
      <ToastProvider>
        <LockGate>
          <p>conteúdo do app</p>
        </LockGate>
      </ToastProvider>
    </DataProvider>,
  )

async function lockOn(after: LockAfter = 0) {
  writeLock(await makeLock('4821', after))
}
const setVisibility = (v: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}
const typePin = (pin: string) => {
  fireEvent.change(screen.getByLabelText('PIN'), { target: { value: pin } })
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
}

beforeEach(() => {
  localStorage.clear()
  setVisibility('visible')
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

describe('trava do app', () => {
  it('sem bloqueio: abre direto', () => {
    mount()
    expect(screen.getByText('conteúdo do app')).toBeTruthy()
  })

  it('com bloqueio: nem monta o conteúdo; PIN errado avisa; PIN certo abre', async () => {
    await lockOn()
    mount()
    expect(screen.getByText('BarnaBank bloqueado')).toBeTruthy()
    expect(screen.queryByText('conteúdo do app')).toBeNull()
    typePin('1111')
    expect(await screen.findByText('PIN errado.')).toBeTruthy()
    expect(screen.queryByText('conteúdo do app')).toBeNull()
    typePin('4821')
    expect(await screen.findByText('conteúdo do app')).toBeTruthy()
  })

  it('5 erros: espera obrigatória e o campo trava', async () => {
    await lockOn()
    mount()
    for (let i = 0; i < 5; i++) {
      typePin('1111')
      await waitFor(() => expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe(''))
    }
    expect(await screen.findByText(/Espere para tentar de novo/)).toBeTruthy()
    expect((screen.getByLabelText('PIN') as HTMLInputElement).disabled).toBe(true)
  })

  it('sair do app e voltar tranca de novo (sempre que sair); com "só ao abrir" não tranca', async () => {
    await lockOn(0)
    mount()
    typePin('4821')
    await screen.findByText('conteúdo do app')
    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    expect(await screen.findByText('BarnaBank bloqueado')).toBeTruthy()
    cleanup()

    localStorage.clear()
    await lockOn(-1)
    mount()
    typePin('4821')
    await screen.findByText('conteúdo do app')
    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    expect(screen.getByText('conteúdo do app')).toBeTruthy()
  })

  it('desligar o bloqueio nas Configurações abre o app trancado na hora', async () => {
    await lockOn()
    mount()
    expect(screen.getByText('BarnaBank bloqueado')).toBeTruthy()
    act(() => writeLock(null))
    expect(await screen.findByText('conteúdo do app')).toBeTruthy()
    expect(readLock()).toBeNull()
  })

  it('"Esqueci o PIN": tira o bloqueio e sai da conta', async () => {
    await lockOn()
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci o PIN' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair e tirar o bloqueio' }))
    expect(await screen.findByText('conteúdo do app')).toBeTruthy()
    expect(localStorage.getItem(LOCK_KEY)).toBeNull()
  })
})
