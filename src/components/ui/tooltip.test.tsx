// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Tooltip } from './tooltip'

afterEach(cleanup)

describe('Tooltip', () => {
  it('mostra o texto num balão com setinha e deixa o controle com o próprio nome', () => {
    render(
      <Tooltip label="Editar pessoa">
        <button type="button" aria-label="Editar pessoa">
          x
        </button>
      </Tooltip>,
    )
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('Editar pessoa')
    // setinha: um quadrado girado 45° dentro do balão
    const seta = tip.querySelector('span[aria-hidden="true"]')
    expect(seta?.className).toContain('rotate-45')
    expect(seta?.className).toContain('-bottom-1')
    // balão invertido, não captura o ponteiro e só aparece no hover/foco
    expect(tip.className).toContain('bg-fg')
    expect(tip.className).toContain('pointer-events-none')
    expect(tip.className).toContain('opacity-0')
    expect(tip.className).toContain('group-hover/tip:opacity-100')
    expect(tip.className).toContain('group-focus-within/tip:opacity-100')
    expect(screen.getByRole('button', { name: 'Editar pessoa' })).toBeTruthy()
  })

  it('side e align mudam onde o balão e a setinha ficam', () => {
    render(
      <Tooltip label="Configurações" side="bottom" align="end">
        <button type="button">x</button>
      </Tooltip>,
    )
    const tip = screen.getByRole('tooltip')
    expect(tip.className).toContain('top-full')
    expect(tip.className).toContain('right-0')
    const seta = tip.querySelector('span[aria-hidden="true"]')
    expect(seta?.className).toContain('-top-1')
    expect(seta?.className).toContain('right-3')
  })
})
