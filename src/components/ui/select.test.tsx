// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Select } from './select'

const OPTS = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gama' },
]

function Box() {
  const [v, setV] = useState('a')
  return <Select id="s" value={v} onChange={setV} options={OPTS} />
}

afterEach(cleanup)

describe('Select', () => {
  it('abre a lista, escolhe com o clique e fecha', () => {
    render(<Box />)
    const box = screen.getByRole('combobox')
    expect(box.textContent).toBe('Alfa')
    fireEvent.click(box)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.click(screen.getByRole('option', { name: 'Gama' }))
    expect(box.textContent).toBe('Gama')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('teclado: setas e Enter escolhem; Esc fecha sem trocar', () => {
    render(<Box />)
    const box = screen.getByRole('combobox')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.textContent).toBe('Beta')
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box.textContent).toBe('Beta')
  })

  it('clicar fora fecha', () => {
    render(<Box />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
