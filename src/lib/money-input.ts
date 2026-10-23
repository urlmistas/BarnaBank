/** "1.234,56" / "1234,56" / "1234.56" → 1234.56. Vazio ou inválido → NaN. */
export function parseMoney(text: string): number {
  let s = text.replace(/[^\d.,-]/g, '').trim()
  if (!s) return NaN
  const comma = s.lastIndexOf(',')
  const dot = s.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    // o último separador é o decimal
    s = comma > dot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (comma >= 0) s = s.replace(',', '.')
  else if (dot >= 0 && /\.\d{3}$/.test(s) && s.indexOf('.') === dot) s = s.replace('.', '')
  const n = Number(s)
  return isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

/** 1234.5 → "1234,50" (para preencher o campo) */
export function formatMoneyInput(v: number): string {
  return isFinite(v) ? v.toFixed(2).replace('.', ',') : ''
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '')
