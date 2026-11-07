// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Tabs } from './tabs'

afterEach(cleanup)

function Demo() {
  const [v, setV] = useState('a')
  return (
    <Tabs
      baseId="t"
      label="Abas"
      value={v}
      onChange={setV}
      items={[
        { value: 'a', label: 'Me deve', count: 2 },
        { value: 'b', label: 'Linha do tempo' },
        { value: 'c', label: 'Calendário' },
      ]}
    />
  )
}

describe('Tabs no celular', () => {
  it('rola para o lado e nenhuma aba quebra o texto em duas linhas', () => {
    render(<Demo />)
    expect(screen.getByRole('tablist').className).toContain('overflow-x-auto')
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.className).toContain('whitespace-nowrap')
      expect(tab.className).toContain('shrink-0')
    }
  })

  it('a aba escolhida é trazida para a tela', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<Demo />)
    scroll.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: 'Linha do tempo' }))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
  })
})
