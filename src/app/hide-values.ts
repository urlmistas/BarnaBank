// "Olhinho": esconde os valores em dinheiro da tela. Mesma chave do app antigo, então a escolha vale para os dois.
export const HIDE_KEY = 'barnabank_hide_values'

export function readHidden(): boolean {
  try {
    return globalThis.localStorage?.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function writeHidden(on: boolean) {
  try {
    globalThis.localStorage?.setItem(HIDE_KEY, on ? '1' : '0')
  } catch {
    /* sem storage: vale só até recarregar */
  }
}

export const MASK = 'R$ •••••'
export const maskMoney = (_v: number) => MASK
