import { describe, expect, it } from 'vitest'
import { formatMoneyInput, maskMoney, onlyDigits, parseMoney } from './money-input'

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

describe('maskMoney', () => {
  it('põe o ponto nos milhares enquanto digita', () => {
    expect(maskMoney('1000,00')).toBe('1.000,00')
    expect(maskMoney('20000,00')).toBe('20.000,00')
    expect(maskMoney('1234567')).toBe('1.234.567')
    expect(maskMoney('999')).toBe('999')
  })
  it('aceita vírgula solta, limita centavos e ignora lixo', () => {
    expect(maskMoney('1000,')).toBe('1.000,')
    expect(maskMoney('1.000,123')).toBe('1.000,12')
    expect(maskMoney('R$ 5a')).toBe('5')
    expect(maskMoney('007')).toBe('7')
    expect(maskMoney('')).toBe('')
  })
  it('o resultado continua válido para parseMoney', () => {
    expect(parseMoney(maskMoney('20000,5'))).toBe(20000.5)
  })
})
