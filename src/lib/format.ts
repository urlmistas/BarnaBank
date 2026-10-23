import type { ISODate, Settings } from '@/lib/types'
import { daysBetweenISO, parseISO } from '@/lib/finance/dates'

const CURRENCY_LOCALE: Record<string, string> = { BRL: 'pt-BR', USD: 'en-US', EUR: 'de-DE' }

export function makeMoney(settings: Pick<Settings, 'currency'>) {
  const cur = settings.currency || 'BRL'
  const f = new Intl.NumberFormat(CURRENCY_LOCALE[cur] || 'pt-BR', { style: 'currency', currency: cur })
  return (v: number) => f.format(Math.abs(v) < 0.005 ? 0 : v)
}

/** fmtDate do app antigo (dd/mm/aa por padrão) */
export function makeDate(settings: Pick<Settings, 'dateFormat'>) {
  return (iso: ISODate) => {
    if (!iso) return '—'
    const [y, m, d] = iso.split('-')
    if (settings.dateFormat === 'mdy') return `${m}/${d}/${y.slice(2)}`
    if (settings.dateFormat === 'iso') return iso
    return `${d}/${m}/${y.slice(2)}`
  }
}

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "Hoje", "Amanhã", "qua, 29 out" */
export function relativeDay(iso: ISODate, today: ISODate): string {
  const diff = daysBetweenISO(today, iso)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  const d = parseISO(iso)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

export function lateLabel(iso: ISODate, today: ISODate): string {
  const n = daysBetweenISO(iso, today)
  return `Vencido há ${n}d`
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** primeiro nome ("Ana Souza" → "Ana") */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name
