// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { useGestures } from './use-gestures'

function Harness(props: {
  enabled: boolean
  back?: boolean
  onBack: () => void
  onRefresh: () => Promise<void> | void
  onTab?: (d: -1 | 1) => void
  canTab?: boolean
  tabsOn?: boolean
}) {
  const { pull, edge, refreshing } = useGestures({
    enabled: props.enabled,
    canGoBack: () => props.back ?? true,
    onBack: props.onBack,
    onRefresh: props.onRefresh,
    canTab: () => props.canTab ?? true,
    tabsEnabled: () => props.tabsOn ?? true,
    onTab: props.onTab,
  })
  return (
    <div>
      <input aria-label="campo" />
      <div data-testid="card" data-no-tab-swipe="">
        card
      </div>
      <span data-testid="s">{refreshing ? 'refreshing' : String(pull)}</span>
      <span data-testid="edge">{String(edge)}</span>
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

  it('arrastar da borda: a tela acompanha o dedo; soltar devagar também volta; arrasto curto solta e volta ao lugar', () => {
    const onBack = vi.fn()
    const { getByTestId } = render(<Harness enabled onBack={onBack} onRefresh={vi.fn()} />)
    touch('touchstart', 5, 300)
    touch('touchmove', 60, 302)
    expect(Number(getByTestId('edge').textContent)).toBeGreaterThan(0)
    touch('touchmove', 110, 302)
    touch('touchend', 110, 302)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(getByTestId('edge').textContent).toBe('0')
    touch('touchstart', 5, 300)
    touch('touchmove', 40, 300)
    touch('touchend', 40, 300)
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(getByTestId('edge').textContent).toBe('0')
  })

  it('arrastão rápido para o lado troca de aba (esquerda = próxima, direita = anterior)', () => {
    const onTab = vi.fn()
    render(<Harness enabled onBack={vi.fn()} onRefresh={vi.fn()} onTab={onTab} />)
    touch('touchstart', 300, 300)
    touch('touchend', 150, 305)
    touch('touchstart', 100, 300)
    touch('touchend', 260, 296)
    expect(onTab.mock.calls).toEqual([[1], [-1]])
  })

  it('não troca de aba: desligado nas Configurações, fora das telas do menu, em campo de texto, em card deslizável ou em área que rola', () => {
    const onTab = vi.fn()
    const { rerender, getByTestId, getByLabelText } = render(<Harness enabled onBack={vi.fn()} onRefresh={vi.fn()} onTab={onTab} tabsOn={false} />)
    touch('touchstart', 300, 300)
    touch('touchend', 150, 300)
    rerender(<Harness enabled onBack={vi.fn()} onRefresh={vi.fn()} onTab={onTab} canTab={false} />)
    touch('touchstart', 300, 300)
    touch('touchend', 150, 300)
    rerender(<Harness enabled onBack={vi.fn()} onRefresh={vi.fn()} onTab={onTab} />)
    touch('touchstart', 300, 300, getByLabelText('campo'))
    touch('touchend', 150, 300)
    touch('touchstart', 300, 300, getByTestId('card'))
    touch('touchend', 150, 300)
    // área que rola para o lado
    const scroller = document.createElement('div')
    scroller.style.overflowX = 'auto'
    Object.defineProperty(scroller, 'scrollWidth', { value: 900 })
    Object.defineProperty(scroller, 'clientWidth', { value: 300 })
    document.body.appendChild(scroller)
    touch('touchstart', 300, 300, scroller)
    touch('touchend', 150, 300)
    scroller.remove()
    expect(onTab).not.toHaveBeenCalled()
  })
})
