import { describe, expect, it } from 'vitest'
import { isMpWallet } from './mercadopago'

describe('carteira Mercado Pago (antiga, criada sozinha)', () => {
  it('acha a carteira pelo nome, sem ligar para maiúscula ou espaço', () => {
    expect(isMpWallet({ name: '  mercado PAGO ' })).toBe(true)
    expect(isMpWallet({ name: 'Nubank' })).toBe(false)
  })
})
