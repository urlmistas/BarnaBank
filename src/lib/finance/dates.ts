import type { ISODate, YearMonth } from '@/lib/types'

// Helpers de data portados do app antigo (app.js: pad2/toISO ~l.59, daysInMonth ~l.460,
// ymKey/ymOf/ymAdd/dayIn/daysFromToday ~l.3034). Tudo em horário LOCAL.

export const pad2 = (n: number) => (n < 10 ? '0' : '') + n

export function toISO(d: Date): ISODate {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

/** 'YYYY-MM-DD' → Date à meia-noite local (equivale a `new Date(iso + 'T00:00:00')`). */
export function parseISO(iso: ISODate): Date {
  return new Date(iso + 'T00:00:00')
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}

export function daysBetweenISO(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

export const ymKey = (y: number, m: number): YearMonth => y + '-' + pad2(m + 1)
export const ymOf = (iso: string): YearMonth => String(iso).slice(0, 7)

export function ymAdd(key: YearMonth, n: number): YearMonth {
  let y = +key.slice(0, 4)
  let m = +key.slice(5, 7) - 1 + n
  y += Math.floor(m / 12)
  m = ((m % 12) + 12) % 12
  return ymKey(y, m)
}

/** dia `day` do mês `key`, limitado ao último dia do mês */
export function dayIn(key: YearMonth, day: number): ISODate {
  const y = +key.slice(0, 4)
  const m = +key.slice(5, 7) - 1
  return toISO(new Date(y, m, Math.min(Math.max(1, day || 1), daysInMonth(y, m))))
}

export function daysFrom(today: ISODate, iso: ISODate): number {
  return daysBetweenISO(today, iso)
}

export const round2 = (v: number) => Math.round(v * 100) / 100
export const EPS = 0.005
