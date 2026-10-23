import { describe, expect, it } from 'vitest'
import { dataCompleta, dataExtenso, extenso } from './extenso'

describe('extenso', () => {
  it.each([
    [0, 'zero reais'],
    [1, 'um real'],
    [0.01, 'um centavo'],
    [2.5, 'dois reais e cinquenta centavos'],
    [15, 'quinze reais'],
    [21, 'vinte e um reais'],
    [100, 'cem reais'],
    [101, 'cento e um reais'],
    [250, 'duzentos e cinquenta reais'],
    [1000, 'mil reais'],
    [1100, 'mil e cem reais'],
    [1234.5, 'mil, duzentos e trinta e quatro reais e cinquenta centavos'],
    [2000, 'dois mil reais'],
    [1000000, 'um milhão de reais'],
    [2500000, 'dois milhões, quinhentos mil reais'],
  ])('%d → %s', (v, texto) => expect(extenso(v)).toBe(texto))

  it('arredonda para centavos', () => expect(extenso(0.1 + 0.2)).toBe('trinta centavos'))
})

describe('datas', () => {
  it('por extenso', () => expect(dataExtenso('2026-03-05')).toBe('5 de março de 2026'))
  it('completa', () => expect(dataCompleta('2026-03-05')).toBe('05/03/2026'))
})
