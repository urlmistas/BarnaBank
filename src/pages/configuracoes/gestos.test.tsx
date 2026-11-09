// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/toast'
import { readTabSwipe } from '@/lib/gestures'
import { readShake } from '@/lib/shake'
import { GesturesSection } from './gestos'

const mount = () =>
  render(
    <ToastProvider>
      <GesturesSection />
    </ToastProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'DeviceMotionEvent')
})

describe('Configurações: gestos', () => {
  it('deslizar entre abas: ligado por padrão; desliga e grava', () => {
    mount()
    const sw = screen.getByRole('switch', { name: 'Deslizar entre as abas' })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    expect(readTabSwipe()).toBe(false)
    expect(sw.getAttribute('aria-checked')).toBe('false')
  })

  it('sem sensor de movimento a opção de sacudir nem aparece', () => {
    mount()
    expect(screen.queryByRole('switch', { name: 'Sacudir para esconder os valores' })).toBeNull()
  })

  it('iPhone: pede a permissão do sensor; negada, fica desligado e avisa; concedida, liga', async () => {
    let answer: 'granted' | 'denied' = 'denied'
    Object.defineProperty(window, 'DeviceMotionEvent', { value: class { static requestPermission = async () => answer }, configurable: true })
    mount()
    const sw = screen.getByRole('switch', { name: 'Sacudir para esconder os valores' })
    fireEvent.click(sw)
    expect(await screen.findByText(/Sem permissão para o sensor/)).toBeTruthy()
    expect(readShake()).toBe(false)
    answer = 'granted'
    fireEvent.click(sw)
    await waitFor(() => expect(readShake()).toBe(true))
    expect(sw.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(sw)
    await waitFor(() => expect(readShake()).toBe(false))
  })

  it('outros navegadores (sem pedir permissão): liga direto', async () => {
    Object.defineProperty(window, 'DeviceMotionEvent', { value: class {}, configurable: true })
    mount()
    fireEvent.click(screen.getByRole('switch', { name: 'Sacudir para esconder os valores' }))
    await waitFor(() => expect(readShake()).toBe(true))
  })
})
