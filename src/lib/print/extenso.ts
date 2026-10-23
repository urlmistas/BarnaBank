// Número por extenso e datas por extenso, para o recibo (extenso ~l.7966 do app antigo).

const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function ate999(n: number): string {
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const r = n % 100
  const parts: string[] = []
  if (c) parts.push(C[c])
  if (r) {
    if (r < 20) parts.push(U[r])
    else {
      const dz = Math.floor(r / 10)
      const un = r % 10
      parts.push(D[dz] + (un ? ' e ' + U[un] : ''))
    }
  }
  return parts.join(' e ')
}

function inteiro(n: number): string {
  if (n === 0) return 'zero'
  const grupos: [number, string, string][] = [[1e9, 'bilhão', 'bilhões'], [1e6, 'milhão', 'milhões'], [1e3, 'mil', 'mil']]
  const parts: string[] = []
  let rest = n
  for (const g of grupos) {
    const q = Math.floor(rest / g[0])
    if (!q) continue
    rest -= q * g[0]
    parts.push(g[0] === 1e3 && q === 1 ? 'mil' : ate999(q) + ' ' + (q === 1 ? g[1] : g[2]))
  }
  if (rest) parts.push(ate999(rest))
  // "mil e cem", "mil duzentos e trinta": usa "e" antes do último grupo quando ele é pequeno ou redondo
  if (parts.length > 1 && rest && (rest < 100 || rest % 100 === 0)) return parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1]
  return parts.join(', ')
}

/** 1234.5 → "mil, duzentos e trinta e quatro reais e cinquenta centavos" */
export function extenso(v: number): string {
  const cents = Math.round(v * 100)
  const r = Math.floor(cents / 100)
  const c = cents % 100
  const out: string[] = []
  if (r) out.push(inteiro(r) + (r >= 1e6 && r % 1e6 === 0 ? ' de' : '') + (r === 1 ? ' real' : ' reais'))
  if (c) out.push(inteiro(c) + (c === 1 ? ' centavo' : ' centavos'))
  return out.join(' e ') || 'zero reais'
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** '2026-03-05' → '5 de março de 2026' */
export const dataExtenso = (iso: string) => parseInt(iso.slice(8, 10), 10) + ' de ' + MESES[+iso.slice(5, 7) - 1] + ' de ' + iso.slice(0, 4)

/** '2026-03-05' → '05/03/2026' */
export const dataCompleta = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
