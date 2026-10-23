import type { Settings } from '@/lib/types'

// Preferências de exibição do app NOVO (chave própria `bbweb_prefs`).
// Sem escolha ("como no BarnaBank atual"), valem a moeda e o formato de data gravados pelo app antigo
// (barnabank_settings_v1 ou o `settings` da conta) — que este app nunca altera.

export const PREFS_KEY = 'bbweb_prefs'

export const CURRENCIES = [
  { value: 'BRL', label: 'Real (R$)' },
  { value: 'USD', label: 'Dólar (US$)' },
  { value: 'EUR', label: 'Euro (€)' },
] as const
export const DATE_FORMATS = [
  { value: 'dmy', label: 'DD/MM/AA' },
  { value: 'mdy', label: 'MM/DD/AA' },
  { value: 'iso', label: 'AAAA-MM-DD' },
] as const

export type Currency = (typeof CURRENCIES)[number]['value']
export type DateFormat = (typeof DATE_FORMATS)[number]['value']

export interface DisplayPrefs {
  currency?: Currency
  dateFormat?: DateFormat
}

const isCurrency = (v: unknown): v is Currency => CURRENCIES.some((c) => c.value === v)
const isDateFormat = (v: unknown): v is DateFormat => DATE_FORMATS.some((d) => d.value === v)

/** só aceita valores conhecidos; o resto é ignorado */
export function cleanPrefs(raw: unknown): DisplayPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: DisplayPrefs = {}
  if (isCurrency(o.currency)) out.currency = o.currency
  if (isDateFormat(o.dateFormat)) out.dateFormat = o.dateFormat
  return out
}

/** a escolha deste app, quando existe, vale por cima das configurações do antigo */
export function applyPrefs(settings: Settings, prefs: DisplayPrefs): Settings {
  return { ...settings, ...(prefs.currency && { currency: prefs.currency }), ...(prefs.dateFormat && { dateFormat: prefs.dateFormat }) }
}

export function readPrefs(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): DisplayPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY)
    return raw ? cleanPrefs(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function writePrefs(prefs: DisplayPrefs, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage) {
  try {
    const clean = cleanPrefs(prefs)
    if (Object.keys(clean).length) storage?.setItem(PREFS_KEY, JSON.stringify(clean))
    else storage?.removeItem(PREFS_KEY)
  } catch {
    /* sem storage: vale só até recarregar */
  }
}
