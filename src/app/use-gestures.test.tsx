// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useGestures } from './use-gestures'

function Harness(props: { enabled: boolean; back?: boolean; onBack: () => void; onRefresh: () => Promise<void> | void }) {
  const { pull, refreshing } = useGestures({ enabled: props.enabled, canGoBack: () => props.back ?? true, onBack: props.onBack, onRefresh: props.onRefresh })
  return (
    <div>
      <input aria-label="campo" />
      <span data-testid="s">{refreshing ? 'refreshing' : String(pull)}</span>
    </div>
  )
}

function touch(type: 'touchstart' | 'touchmove' | 'touchend', x: number, y: number, target: EventTarget = window) {
  const e = new Event(type, { bubbles: true }) as Event & { touches: unknown[]; changedTouches: unknown[] }
  const pt = { clientX: x, clientY: y }
  e.touches = type === 'touchend' ? [] : [pt]
  e.changedTouches = [pt]
  act(() => void target.dispatchEvent(e))
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

describe('useGestures', () => {
  it('desligado (navegador comum): nenhum gesto faz nada', () => {
    const onBack = vi.fn()
    render(<Harness enabled={false} onBack={onBack} onRefresh={vi.fn()} />)
    touch('touchstart', 5, 300)
    touch('touchend', 150, 300)
    expect(onBack).not.toHaveBeenCalled()
  })

  it('arrastar da borda esquerda volta; se não há para onde voltar, não faz nada', () => {
    const onBack = vi.fn()
    const { rerender } = render(<Harness enabled onBack={onBack} onRefresh={vi.fn()} />)
    touch('touchstart', 5, 300)
    touch('touchend', 150, 305)
    expect(onBack).toHaveBeenCalledTimes(1)
    rerender(<Harness enabled back={false} onBack={onBack} onRefresh={vi.fn()} />)
    touch('touchstart', 5, 300)
    touch('touchend', 150, 305)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('puxar para baixo no topo passa do limite: atualiza uma vez e mostra o estado', async () => {
    let done: () => void = () => {}
    const onRefresh = vi.fn(() => new Promise<void>((ok) => (done = ok)))
    const { getByTestId } = render(<Harness enabled onBack={vi.fn()} onRefresh={onRefresh} />)
    touch('touchstart', 200, 100)
    touch('touchmove', 202, 200)
    touch('touchmove', 202, 260) // 160 px de dedo = 80 de indicador
    expect(Number(getByTestId('s').textContent)).toBeGreaterThanOrEqual(64)
    touch('touchend', 202, 260)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(getByTestId('s').textContent).toBe('refreshing')
    // enquanto atualiza, outro puxar não dispara de novo
    touch('touchstart', 200, 100)
    touch('touchmove', 202, 300)
    touch('touchend', 202, 300)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await act(async () => done())
    expect(getByTestId('s').textContent).toBe('0')
  })

  it('puxar pouco, ou com a página rolada, não atualiza', () => {
    const onRefresh = vi.fn()
    render(<Harness enabled onBack={vi.fn()} onRefresh={onRefresh} />)
    touch('touchstart', 200, 100)
    touch('touchmove', 202, 150)
    touch('touchend', 202, 150)
    expect(onRefresh).not.toHaveBeenCalled()
    Object.defineProperty(window, 'scrollY', { value: 300, configurable: true })
    touch('touchstart', 200, 100)
    touch('touchmove', 202, 300)
    touch('touchend', 202, 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('não interfere em campo de texto nem com janela aberta', () => {
    const onBack = vi.fn()
    const { getByLabelText } = render(<Harness enabled onBack={onBack} onRefresh={vi.fn()} />)
    touch('touchstart', 5, 300, getByLabelText('campo'))
    touch('touchend', 150, 300)
    expect(onBack).not.toHaveBeenCalled()
    const dlg = document.createElement('dialog')
    dlg.setAttribute('open', '')
    document.body.appendChild(dlg)
    touch('touchstart', 5, 300)
    touch('touchend', 150, 300)
    expect(onBack).not.toHaveBeenCalled()
    dlg.remove()
  })
})
