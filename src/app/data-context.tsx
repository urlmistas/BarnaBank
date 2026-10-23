import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAppData, type LoadResult } from '@/lib/storage'
import { toISO } from '@/lib/finance/dates'
import { makeDate, makeMoney } from '@/lib/format'

interface DataState {
  status: 'loading' | 'ready'
  result: LoadResult | null
  today: string
  money: (v: number) => string
  date: (iso: string) => string
}

const Ctx = createContext<DataState | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [today] = useState(() => toISO(new Date()))
  const [result, setResult] = useState<LoadResult | null>(null)

  useEffect(() => {
    // leitura fora do primeiro paint: deixa o esqueleto aparecer e não bloqueia a navegação
    const id = window.setTimeout(() => setResult(loadAppData(today)), 0)
    // outra aba (o app antigo) alterou os dados → relê
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('barnabank_')) setResult(loadAppData(today))
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('storage', onStorage)
    }
  }, [today])

  const value = useMemo<DataState>(() => {
    const settings = result?.settings ?? { currency: 'BRL', dateFormat: 'dmy', ownerName: '' }
    return { status: result ? 'ready' : 'loading', result, today, money: makeMoney(settings), date: makeDate(settings) }
  }, [result, today])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppData fora do DataProvider')
  return v
}
