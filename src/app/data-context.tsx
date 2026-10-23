import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, loadAppData, type LoadResult } from '@/lib/storage'
import {
  cloudErrorText, isAuthError, readSession, signIn as cloudSignIn, writeSession, type CloudSession, type Fetch,
} from '@/lib/cloud'
import { toISO } from '@/lib/finance/dates'
import { makeDate, makeMoney } from '@/lib/format'
import { applyPrefs, PREFS_KEY, readPrefs, writePrefs, type DisplayPrefs } from '@/lib/prefs'
import { STORE_EVENT } from '@/lib/store'
import { sbPushIfChanged, sbResolve, sbSync, type SbResult, type SbRow, type SyncEnv } from '@/lib/sync/supabase'
import { botErrorText, botOn, botSync, readBotCfg, testBot, writeBotCfg } from '@/lib/sync/worker'
import type { Settings } from '@/lib/types'

export interface CloudState {
  status: 'off' | 'loading' | 'ok' | 'error'
  email?: string
  /** última vez que a conta foi sincronizada */
  updatedAt?: string
  error?: string
}

export interface BotUiState {
  status: 'off' | 'loading' | 'ok' | 'error'
  url?: string
  /** última sincronização com o bot */
  last?: string
  error?: string
}

interface DataState {
  status: 'loading' | 'ready'
  result: LoadResult | null
  today: string
  money: (v: number) => string
  date: (iso: string) => string
  /** configurações vindas dos dados deste aparelho, antes das preferências deste app */
  baseSettings: Settings
  prefs: DisplayPrefs
  setPrefs: (p: DisplayPrefs) => void
  /** edita/paga/exclui: só com dados reais deste aparelho */
  canEdit: boolean
  /** cria dívida: aparelho, vazio ou demonstração */
  canCreate: boolean
  /** por que não dá para editar (para explicar na tela) */
  readOnlyReason: string | null
  cloud: CloudState
  bot: BotUiState
  /** aparelho e conta mudaram: a pessoa escolhe qual manter */
  conflict: SbRow | null
  /** o diálogo do conflito está aberto (fechar sem escolher deixa a pendência para depois) */
  conflictOpen: boolean
  setConflictOpen: (open: boolean) => void
  resolveConflict: (useCloud: boolean) => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => void
  /** sincroniza agora com a conta e com o bot */
  refreshCloud: () => void
  /** liga o bot (testa antes); devolve a mensagem de erro, ou null se conectou */
  connectBot: (url: string, key: string) => Promise<string | null>
  disconnectBot: () => void
}

const Ctx = createContext<DataState | null>(null)

const forced = () => new URLSearchParams(globalThis.location?.search ?? '').get('dados')

const fetcher: Fetch = (url, init) => fetch(url, init)
const SB_DELAY = 1500
const BOT_DELAY = 2500

function botUiFromCfg(): BotUiState {
  const c = readBotCfg()
  if (!botOn(c)) return { status: 'off' }
  return { status: c.err ? 'error' : 'ok', url: c.url, last: c.last, error: c.err || undefined }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [today] = useState(() => toISO(new Date()))
  const [local, setLocal] = useState<LoadResult | null>(null)
  const [cloud, setCloud] = useState<CloudState>(() => {
    const s = forced() ? null : readSession()
    return s ? { status: 'ok', email: s.email } : { status: 'off' }
  })
  const [bot, setBot] = useState<BotUiState>(() => (forced() ? { status: 'off' } : botUiFromCfg()))
  const [conflict, setConflict] = useState<SbRow | null>(null)
  const [conflictOpen, setConflictOpen] = useState(false)
  const session = useRef<CloudSession | null>(forced() ? null : readSession())
  const sbBusy = useRef(false)
  const sbAgain = useRef(false)
  const botBusy = useRef(false)
  const botAgain = useRef(false)
  const sbTimer = useRef(0)
  const botTimer = useRef(0)
  // agendadores (debounce): ficam em ref porque runSb/runBot os chamam e eles chamam runSb/runBot
  const scheduleSb = useRef<() => void>(() => {})
  const scheduleBot = useRef<() => void>(() => {})
  const [prefs, setPrefsState] = useState<DisplayPrefs>(() => readPrefs())
  const setPrefs = useCallback((p: DisplayPrefs) => {
    writePrefs(p)
    setPrefsState(p)
  }, [])

  const sbEnv = useMemo<SyncEnv>(
    () => ({
      fetcher,
      session: () => session.current,
      save: (s) => {
        session.current = s
        writeSession(s)
      },
    }),
    [],
  )

  const dropSession = useCallback((error?: string) => {
    session.current = null
    writeSession(null)
    setConflict(null)
    setConflictOpen(false)
    setCloud({ status: 'off', error })
  }, [])

  // conta (Supabase): uma sincronização por vez; mudança feita durante ela pede outra logo depois
  const runSb = useCallback(
    async (job: () => Promise<SbResult>): Promise<void> => {
      if (!session.current || forced()) return
      if (sbBusy.current) {
        sbAgain.current = true
        return
      }
      sbBusy.current = true
      setCloud((c) => ({ ...c, status: 'loading', email: session.current?.email ?? c.email, error: undefined }))
      try {
        const res = await job()
        if (res.kind === 'off') return
        if (res.kind === 'conflict') {
          setConflict(res.row)
          setConflictOpen(true)
        } else setConflict(null)
        setCloud({ status: 'ok', email: session.current?.email, updatedAt: new Date().toISOString() })
      } catch (e) {
        // sessão que não vale mais: sai da conta, mas os dados continuam neste aparelho
        if (isAuthError(e)) dropSession('Sua sessão expirou. Entre de novo.')
        else setCloud((c) => ({ ...c, status: 'error', error: cloudErrorText(e) }))
      } finally {
        sbBusy.current = false
        if (sbAgain.current) {
          sbAgain.current = false
          scheduleSb.current()
        }
      }
    },
    [dropSession],
  )

  const runBot = useCallback(async (): Promise<void> => {
    if (!botOn(readBotCfg()) || forced()) return
    if (botBusy.current) {
      botAgain.current = true
      return
    }
    botBusy.current = true
    setBot((b) => ({ ...b, status: 'loading', error: undefined }))
    try {
      await botSync({ fetcher })
      const c = readBotCfg()
      setBot({ status: 'ok', url: c.url, last: c.last })
    } catch (e) {
      const c = readBotCfg()
      setBot({ status: 'error', url: c.url, last: c.last, error: botErrorText(e) })
    } finally {
      botBusy.current = false
      if (botAgain.current) {
        botAgain.current = false
        scheduleBot.current()
      }
    }
  }, [])

  useEffect(() => {
    scheduleSb.current = () => {
      if (!session.current || forced()) return
      window.clearTimeout(sbTimer.current)
      sbTimer.current = window.setTimeout(() => void runSb(() => sbPushIfChanged(sbEnv)), SB_DELAY)
    }
    scheduleBot.current = () => {
      if (!botOn(readBotCfg()) || forced()) return
      window.clearTimeout(botTimer.current)
      botTimer.current = window.setTimeout(() => void runBot(), BOT_DELAY)
    }
  }, [runSb, runBot, sbEnv])

  const syncAll = useCallback(
    async (initial: boolean) => {
      await runSb(() => sbSync(sbEnv, { initial }))
      await runBot()
    },
    [runSb, runBot, sbEnv],
  )

  useEffect(() => {
    // leitura fora do primeiro paint: deixa o esqueleto aparecer e não bloqueia a navegação
    const id = window.setTimeout(() => setLocal(loadAppData(today)), 0)
    // primeira sincronização logo depois do primeiro paint
    const syncId = window.setTimeout(() => void syncAll(true), 0)
    // outra aba (o app antigo) alterou os dados → relê
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith('barnabank_')) setLocal(loadAppData(today))
      if (e.key === null || e.key === PREFS_KEY) setPrefsState(readPrefs())
    }
    // gravação feita por este app (o evento `storage` só chega nas outras abas): relê e agenda o envio
    const onStore = () => {
      setLocal(loadAppData(today))
      scheduleSb.current()
      scheduleBot.current()
    }
    // voltou para a janela: confere se a conta ou o bot mudaram enquanto isso
    const onFocus = () => void syncAll(false)
    window.addEventListener('storage', onStorage)
    window.addEventListener(STORE_EVENT, onStore)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearTimeout(id)
      window.clearTimeout(syncId)
      window.clearTimeout(sbTimer.current)
      window.clearTimeout(botTimer.current)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORE_EVENT, onStore)
      window.removeEventListener('focus', onFocus)
    }
  }, [today, syncAll])

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const s = await cloudSignIn(fetcher, email, password)
        session.current = s
        writeSession(s)
        setCloud({ status: 'loading', email: s.email })
      } catch (e) {
        return cloudErrorText(e)
      }
      // entrou: sincroniza já (erros de rede aparecem no estado da conta, não no login)
      await runSb(() => sbSync(sbEnv, { initial: true }))
      return null
    },
    [runSb, sbEnv],
  )

  const signOut = useCallback(() => {
    // só esquece a sessão do app novo; dados e sessão do app antigo ficam intactos
    dropSession()
  }, [dropSession])

  const resolveConflict = useCallback(
    async (useCloud: boolean) => {
      const row = conflict
      if (!row) return
      setConflict(null)
      setConflictOpen(false)
      await runSb(() => sbResolve(sbEnv, row, useCloud))
    },
    [conflict, runSb, sbEnv],
  )

  const connectBot = useCallback(
    async (url: string, key: string): Promise<string | null> => {
      const u = url.trim()
      const k = key.trim()
      if (!/^https?:\/\/\S+$/i.test(u)) return 'Digite o endereço do bot (começa com https://).'
      if (!k) return 'Digite a chave (SYNC_KEY).'
      try {
        await testBot({ fetcher }, u, k)
      } catch (e) {
        return botErrorText(e)
      }
      // configuração nova: começa sem "última versão lida", então a primeira sincronização compara tudo
      writeBotCfg({ url: u, key: k })
      setBot({ status: 'loading', url: u })
      await runBot()
      return null
    },
    [runBot],
  )

  const disconnectBot = useCallback(() => {
    writeBotCfg(null)
    setBot({ status: 'off' })
  }, [])

  const value = useMemo<DataState>(() => {
    const waiting = !local
    const result = local
    const baseSettings = result?.settings ?? DEFAULT_SETTINGS
    const settings = applyPrefs(baseSettings, prefs)
    const src = waiting ? null : result?.source
    const canEdit = src === 'local'
    const canCreate = !forced() && (src === 'local' || src === 'empty' || src === 'demo')
    const readOnlyReason = waiting
      ? null
      : forced()
        ? 'Visualização de revisão (?dados=): nada é gravado.'
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
      bot,
      conflict,
      conflictOpen,
      setConflictOpen,
      resolveConflict,
      signIn,
      signOut,
      refreshCloud: () => void syncAll(false),
      connectBot,
      disconnectBot,
    }
  }, [local, cloud, bot, conflict, conflictOpen, today, signIn, signOut, resolveConflict, syncAll, connectBot, disconnectBot, prefs, setPrefs])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAppData fora do DataProvider')
  return v
}
