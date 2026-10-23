import { describe, expect, it } from 'vitest'
import { formatMoneyInput, onlyDigits, parseMoney } from './money-input'

describe('parseMoney', () => {
  it.each([
    ['1.234,56', 1234.56],
    ['1234,56', 1234.56],
    ['1234.56', 1234.56],
    ['R$ 50', 50],
    ['0,5', 0.5],
    ['1.234', 1234],
    ['1,234.56', 1234.56],
  ])('%s → %d', (text, n) => expect(parseMoney(text)).toBe(n))

  it('vazio e lixo viram NaN', () => {
    expect(parseMoney('')).toBeNaN()
    expect(parseMoney('abc')).toBeNaN()
  })
})

describe('formatMoneyInput / onlyDigits', () => {
  it('formata com vírgula', () => expect(formatMoneyInput(1234.5)).toBe('1234,50'))
  it('só dígitos', () => expect(onlyDigits('(11) 99999-8888')).toBe('11999998888'))
})
