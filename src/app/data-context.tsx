import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, hasAnyData, loadAppData, type LoadResult } from '@/lib/storage'
import {
  cloudErrorText, isAuthError, pullState, readSession, signIn as cloudSignIn, validSession, writeSession, type CloudSession,
} from '@/lib/cloud'
import { toISO } from '@/lib/finance/dates'
import { makeDate, makeMoney } from '@/lib/format'
import { applyPrefs, PREFS_KEY, readPrefs, writePrefs, type DisplayPrefs } from '@/lib/prefs'
import { STORE_EVENT } from '@/lib/store'
import type { Settings } from '@/lib/types'

export interface CloudState {
  status: 'off' | 'loading' | 'ok' | 'error'
  email?: string
  /** updated_at da linha na nuvem */
  updatedAt?: string
  /** a conta existe mas ainda não tem dados */
  empty?: boolean
  error?: string
}

interface DataState {
  status: 'loading' | 'ready'
  result: LoadResult | null
  today: string
  money: (v: number) => string
  date: (iso: string) => string
  /** configurações vindas dos dados (app antigo ou conta), antes das preferências deste app */
  baseSettings: Settings
  prefs: DisplayPrefs
  setPrefs: (p: DisplayPrefs) => void
  /** edita/paga/exclui: só com os dados deste aparelho */
  canEdit: boolean
  /** cria dívida: aparelho, vazio ou demonstração */
  canCreate: boolean
  /** por que não dá para editar (para explicar na tela) */
  readOnlyReason: string | null
  cloud: CloudState
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => void
  refreshCloud: () => void
}

const Ctx = createContext<DataState | null>(null)

const forced = () => new URLSearchParams(globalThis.location?.search ?? '').get('dados')

export function DataProvider({ children }: { children: ReactNode }) {
  const [today] = useState(() => toISO(new Date()))
  const [local, setLocal] = useState<LoadResult | null>(null)
  const [cloudResult, setCloudResult] = useState<LoadResult | null>(null)
  const [cloud, setCloud] = useState<CloudState>(() => {
    const s = forced() ? null : readSession()
    return s ? { status: 'loading', email: s.email } : { status: 'off' }
  })
  const session = useRef<CloudSession | null>(forced() ? null : readSession())
  const [prefs, setPrefsState] = useState<DisplayPrefs>(() => readPrefs())
  const setPrefs = useCallback((p: DisplayPrefs) => {
    writePrefs(p)
    setPrefsState(p)
  }, [])

  // baixa os dados da conta (GET); erro de sessão → sai da conta e volta para os dados do aparelho
  const pull = useCallback(async () => {
    const s0 = session.current
    if (!s0) return
    setCloud((c) => ({ ...c, status: 'loading', email: s0.email, error: undefined }))
    try {
      const s = await validSession(fetch, s0)
      if (s !== s0) {
        session.current = s
        writeSession(s)
      }
      const row = await pullState(fetch, s, today)
      if (!row || !hasAnyData(row.data)) {
        setCloudResult(null)
        setCloud({ status: 'ok', email: s.email, updatedAt: row?.updatedAt, empty: true })
        return
      }
      setCloudResult({ data: row.data, settings: { ...DEFAULT_SETTINGS, ...row.settings }, source: 'cloud' })
      setCloud({ status: 'ok', email: s.email, updatedAt: row.updatedAt })
    } catch (e) {
      if (isAuthError(e)) {
        session.current = null
        writeSession(null)
        setCloudResult(null)
        setCloud({ status: 'off', error: 'Sua sessão expirou. Entre de novo.' })
      } else {
        setCloud((c) => ({ ...c, status: 'error', error: cloudErrorText(e) }))
      }
    }
  }, [today])

  useEffect(() => {
    // leitura fora do primeiro paint: deixa o esqueleto aparecer e não bloqueia a navegação
    const id = window.setTimeout(() => setLocal(loadAppData(today)), 0)
    if (session.current) void pull()
    // outra aba (o app antigo) alterou os dados → relê
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('barnabank_')) setLocal(loadAppData(today))
      if (e.key === null || e.key === PREFS_KEY) setPrefsState(readPrefs())
    }
    // gravação feita por este app (o evento `storage` só chega nas outras abas)
    const onStore = () => setLocal(loadAppData(today))
    window.addEventListener('storage', onStorage)
    window.addEventListener(STORE_EVENT, onStore)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORE_EVENT, onStore)
    }
  }, [today, pull])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const s = await cloudSignIn(fetch, email, password)
        session.current = s
        writeSession(s)
        await pull()
        return null
      } catch (e) {
        return cloudErrorText(e)
      }
    },
    [pull],
  )

  const signOut = useCallback(() => {
    // só esquece a sessão do app novo; dados e sessão do app antigo ficam intactos
    session.current = null
    writeSession(null)
    setCloudResult(null)
    setCloud({ status: 'off' })
  }, [])

  const value = useMemo<DataState>(() => {
    // ordem: ?dados= força demonstração/vazio > conta na nuvem > dados do aparelho > demonstração
    const waiting = !local || (cloud.status === 'loading' && !cloudResult && !forced())
    const result = forced() ? local : (cloudResult ?? local)
    const baseSettings = result?.settings ?? DEFAULT_SETTINGS
    const settings = applyPrefs(baseSettings, prefs)
    const src = waiting ? null : result?.source
    const canEdit = src === 'local'
    const canCreate = !forced() && (src === 'local' || src === 'empty' || src === 'demo')
    const readOnlyReason = waiting
      ? null
      : forced()
        ? 'Visualização de revisão (?dados=): nada é gravado.'
        : src === 'cloud'
          ? 'Os dados vêm da conta na nuvem. Para editar neste aparelho, saia da conta em Configurações.'
          : src === 'demo'
            ? 'Estes são dados de demonstração.'
            : null
    return {
      status: waiting ? 'loading' : 'ready',
      result: waiting ? null : result,
      today,
      money: makeMoney(settings),
      date: makeDate(settings),
      baseSettings,
      prefs,
      canEdit,
      canCreate,
      readOnlyReason,
      setPrefs,
      cloud,
      signIn,
      signOut,
      refreshCloud: () => void pull(),
    }
  }, [local, cloudResult, cloud, today, signIn, signOut, pull, prefs, setPrefs])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppData fora do DataProvider')
  return v
}
