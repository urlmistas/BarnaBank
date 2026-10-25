import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Cloud, Database, Keyboard, Landmark, Loader2, Palette, RefreshCw, type LucideIcon } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useTheme, THEME_PREFS, type ThemePref } from '@/app/theme'
import { AccountDialog } from '@/app/AccountDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { Select } from '@/components/ui/select'
import { CURRENCIES, DATE_FORMATS, type Currency, type DateFormat } from '@/lib/prefs'
import { clearAuthLink, loginFromLink, peekAuthLink, type AuthLink } from '@/lib/auth-link'
import { cn } from '@/lib/utils'
import { Row, Section } from './layout'
import { BackupSection, DefaultsSection, InstallSection, PixSection } from './sections'
import { ShortcutsSection } from './atalhos'
import { BotPrefsSection, TelegramSection } from './telegram'
import { BOT_URL } from '@/lib/sync/telegram-link'

// Configurações, por categoria: conta e nuvem, visual, finanças, atalhos, dados e app.

const THEME_LABEL: Record<ThemePref, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' }

type CatId = 'conta' | 'visual' | 'financas' | 'atalhos' | 'dados'

const CATS: { id: CatId; label: string; title: string; desc: string; icon: LucideIcon }[] = [
  { id: 'conta', label: 'Conta e nuvem', title: 'Conta e nuvem', desc: 'Entre para guardar os dados na nuvem e ligue o bot do Telegram.', icon: Cloud },
  { id: 'visual', label: 'Visual', title: 'Visual', desc: 'Tema, moeda e formato de data.', icon: Palette },
  { id: 'financas', label: 'Finanças', title: 'Finanças', desc: 'Padrões ao criar dívidas e os dados do seu Pix.', icon: Landmark },
  { id: 'atalhos', label: 'Atalhos', title: 'Atalhos de teclado', desc: 'Navegue sem tirar a mão do teclado.', icon: Keyboard },
  { id: 'dados', label: 'Dados e app', title: 'Dados e app', desc: 'Origem dos dados, backup e instalação.', icon: Database },
]

function catFromHash(): CatId {
  const h = globalThis.location?.hash.replace('#', '')
  return CATS.find((c) => c.id === h)?.id ?? 'conta'
}

export function Configuracoes() {
  // link do e-mail (nova senha / confirmação): index.html guardou o hash e mandou para cá
  const [link] = useState<AuthLink | null>(() => peekAuthLink())
  const handled = useRef(false)
  const [cat, setCat] = useState<CatId>(catFromHash)
  useEffect(() => {
    if (!link) return
    clearAuthLink()
    if (handled.current) return
    handled.current = true
    // confirmou o e-mail: o link já traz a sessão. Entra e recarrega para sincronizar.
    if (!link.error && link.type !== 'recovery') void loginFromLink(globalThis.fetch.bind(globalThis), link).catch(() => {})
  }, [link])
  // "?" no teclado leva a #atalhos mesmo com a tela já aberta
  useEffect(() => {
    const onHash = () => setCat(catFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const pick = (id: CatId) => {
    setCat(id)
    try {
      history.replaceState(history.state, '', '#' + id)
    } catch {
      /* sem history: a escolha vale só nesta tela */
    }
  }
  const cur = CATS.find((c) => c.id === cat)!
  const Icon = cur.icon
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-fg-muted">Ajuste o BarnaBank do seu jeito.</p>

      <div className="mt-6 flex flex-col gap-6 md:flex-row md:gap-8">
        <nav aria-label="Categorias" className="-mx-4 md:mx-0 md:w-56 md:shrink-0">
          <ul className="flex gap-1.5 overflow-x-auto px-4 pb-1 md:sticky md:top-20 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            {CATS.map(({ id, label, icon: I }) => {
              const active = id === cat
              return (
                <li key={id} className="shrink-0 md:shrink">
                  <button
                    type="button"
                    onClick={() => pick(id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-border bg-surface text-fg shadow-sm'
                        : 'border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    <I aria-hidden="true" className={cn('size-4', active && 'text-accent-text')} />
                    {label}
                    {active && <span aria-hidden="true" className="absolute top-[10%] bottom-[10%] left-0 hidden w-0.5 rounded-full bg-accent md:block" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <header className="flex items-start gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-surface text-accent-text">
              <Icon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{cur.title}</h2>
              <p className="text-sm text-fg-muted">{cur.desc}</p>
            </div>
          </header>
          <div className="mt-5 flex flex-col gap-6">
            {cat === 'conta' && (
              <>
                <AccountSection link={link} />
                <TelegramOrBot />
              </>
            )}
            {cat === 'visual' && (
              <>
                <AppearanceSection />
                <FormatSection />
              </>
            )}
            {cat === 'financas' && (
              <>
                <DefaultsSection />
                <PixSection />
              </>
            )}
            {cat === 'atalhos' && <ShortcutsSection />}
            {cat === 'dados' && (
              <>
                <DataSection />
                <BackupSection />
                <InstallSection />
              </>
            )}
          </div>
        </div>
      </div>

      <p className="num mt-10 text-center text-xs text-fg-subtle">
        BarnaBank · versão {__APP_VERSION__} · {__BUILD_DATE__.split('-').reverse().join('/')}
      </p>
    </div>
  )
}

/** bot compartilhado (vincula pela conta) quando o build tem o endereço; senão, ou se a pessoa quiser, o modo com chave */
function TelegramOrBot() {
  const { bot } = useAppData()
  const [own, setOwn] = useState(false)
  const main = BOT_URL && !own && (bot.status === 'off' || bot.account) ? <TelegramSection botUrl={BOT_URL} onOwnBot={() => setOwn(true)} /> : <BotSection />
  return (
    <>
      {main}
      {bot.status !== 'off' && <BotPrefsSection />}
    </>
  )
}

function fmtWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function AccountSection({ link }: { link: AuthLink | null }) {
  const { cloud, conflict, setConflictOpen, refreshCloud, signOut } = useAppData()
  const ref = useRef<HTMLDialogElement>(null)
  const on = cloud.status !== 'off'
  const hint = !on
    ? (cloud.error ?? 'Entre ou crie uma conta para guardar os dados na nuvem e ver em qualquer aparelho.')
    : cloud.status === 'loading'
      ? 'Sincronizando…'
      : cloud.status === 'error'
        ? `${cloud.error} Seus dados continuam neste aparelho e serão enviados quando a conexão voltar.`
        : cloud.updatedAt
          ? `Sincronizado em ${fmtWhen(cloud.updatedAt)}.`
          : 'Conectado.'
  return (
    <>
      <Section title="Conta">
        <Row
          label={on ? (cloud.email ?? 'Conta conectada') : 'Conta na nuvem'}
          hint={<span className={cn(on && cloud.status === 'error' && 'text-neg')}>{hint}</span>}
        >
          {on ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={cloud.status === 'loading'} onClick={refreshCloud}>
                <RefreshCw aria-hidden="true" className={cn(cloud.status === 'loading' && 'motion-safe:animate-spin')} />
                Sincronizar agora
              </Button>
              <Button variant="ghost" size="sm" onClick={signOut}>
                Sair
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
              Entrar
            </Button>
          )}
        </Row>
        {conflict && (
          <Row label="Aparelho e conta são diferentes" hint="Escolha qual versão manter para voltar a sincronizar.">
            <Button size="sm" onClick={() => setConflictOpen(true)}>
              Resolver
            </Button>
          </Row>
        )}
        {on && (
          <p className="px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
            Os dados ficam neste aparelho e vão para a conta a cada alteração. Sair não apaga nada daqui.
          </p>
        )}
      </Section>
      {/* fora da lista com divisórias: o <dialog> não pode virar uma linha dela */}
      <AccountDialog dialogRef={ref} link={link} />
    </>
  )
}

function BotSection() {
  const { bot, connectBot, disconnectBot, refreshCloud } = useAppData()
  const urlId = useId()
  const keyId = useId()
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const on = bot.status !== 'off'

  async function connect(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const msg = await connectBot(url, key)
    setBusy(false)
    if (msg) setErr(msg)
    else {
      setKey('')
      setUrl('')
    }
  }

  if (on) {
    const hint =
      bot.status === 'loading'
        ? 'Sincronizando…'
        : bot.status === 'error'
          ? `${bot.error} Seus dados continuam neste aparelho.`
          : bot.last
            ? `Sincronizado em ${fmtWhen(bot.last)}.`
            : 'Conectado.'
    return (
      <Section title="Nuvem e bot do Telegram">
        <Row label={bot.url ? bot.url.replace(/^https?:\/\//, '') : 'Bot conectado'} hint={<span className={cn(bot.status === 'error' && 'text-neg')}>{hint}</span>}>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={bot.status === 'loading'} onClick={refreshCloud}>
              <RefreshCw aria-hidden="true" className={cn(bot.status === 'loading' && 'motion-safe:animate-spin')} />
              Sincronizar agora
            </Button>
            <Button variant="ghost" size="sm" onClick={disconnectBot}>
              Desligar
            </Button>
          </div>
        </Row>
        <p className="px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
          O que você manda pelo Telegram entra aqui sozinho. Desligar só apaga o endereço e a chave deste aparelho.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Nuvem e bot do Telegram">
      <form onSubmit={connect} className="px-4 py-3.5 sm:px-5" noValidate>
        <p className="text-xs text-fg-muted">
          Para lançar gastos e dívidas pelo Telegram e gerar links de cobrança. Use o endereço e a chave (SYNC_KEY) do seu bot.
        </p>
        <label htmlFor={urlId} className="mt-3 block text-xs font-medium text-fg-muted">
          Endereço do bot
        </label>
        <Input id={urlId} type="url" inputMode="url" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://barnabank-bot.seu-nome.workers.dev" className="mt-1" />
        <label htmlFor={keyId} className="mt-3 block text-xs font-medium text-fg-muted">
          Chave (SYNC_KEY)
        </label>
        <Input id={keyId} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className="mt-1" />
        <p role="alert" aria-live="assertive" className="mt-2 min-h-5 text-xs text-neg">
          {err}
        </p>
        <Button type="submit" size="sm" disabled={busy} className="mt-1">
          {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          {busy ? 'Conectando…' : 'Conectar'}
        </Button>
      </form>
    </Section>
  )
}

function AppearanceSection() {
  const { pref, setPref } = useTheme()
  return (
    <Section title="Aparência">
      <Row label="Tema" hint={pref === 'system' ? 'Acompanha o claro/escuro do aparelho.' : undefined}>
        <Segmented
          id="cfg-tema"
          label="Tema"
          value={pref}
          onChange={setPref}
          options={THEME_PREFS.map((p) => ({ value: p, label: THEME_LABEL[p] }))}
          className="w-full sm:w-72"
        />
      </Row>
    </Section>
  )
}

function FormatSection() {
  const { prefs, setPrefs, baseSettings, money, date, today } = useAppData()
  const curId = useId()
  const dateId = useId()
  // sem escolha, a lista mostra o que já vale (moeda e data gravadas nas configurações dos dados)
  const curValue = (prefs.currency ?? CURRENCIES.find((c) => c.value === baseSettings.currency)?.value ?? 'BRL') as Currency
  const dateValue = (prefs.dateFormat ?? DATE_FORMATS.find((d) => d.value === baseSettings.dateFormat)?.value ?? 'dmy') as DateFormat
  const custom = !!(prefs.currency || prefs.dateFormat)
  return (
    <Section title="Formatos">
      <Row label="Moeda" htmlFor={curId}>
        <Select<Currency>
          id={curId}
          className="sm:w-72"
          value={curValue}
          onChange={(v) => setPrefs({ ...prefs, currency: v })}
          options={[...CURRENCIES]}
        />
      </Row>
      <Row label="Data" htmlFor={dateId}>
        <Select<DateFormat>
          id={dateId}
          className="sm:w-72"
          value={dateValue}
          onChange={(v) => setPrefs({ ...prefs, dateFormat: v })}
          options={[...DATE_FORMATS]}
        />
      </Row>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5">
        <p className="text-xs text-fg-muted">
          Exemplo: <span aria-live="polite" className="num font-medium text-fg">{money(1234.5)} · {date(today)}</span>
        </p>
        {custom && (
          <Button variant="link" size="sm" onClick={() => setPrefs({})}>
            Voltar ao padrão
          </Button>
        )}
      </div>
    </Section>
  )
}

const SOURCE: Record<string, { label: string; hint: string }> = {
  local: { label: 'Este aparelho', hint: 'Guardados neste aparelho. Com a conta ou o bot ligados, também vão para a nuvem.' },
  demo: { label: 'Demonstração', hint: 'Nenhum dado encontrado neste navegador: mostrando dados fictícios.' },
  empty: { label: 'Sem dados', hint: 'Ainda não há nada no BarnaBank deste navegador nem na conta.' },
}

function DataSection() {
  const { result, status } = useAppData()
  const loading = status === 'loading'
  const src = SOURCE[result?.source ?? 'empty']
  return (
    <Section title="Dados">
      <Row label="De onde vêm" hint={loading ? 'Carregando…' : src.hint}>
        {loading ? (
          <Skeleton className="h-5 w-28" />
        ) : (
          <Badge variant={result?.source === 'demo' ? 'accent' : 'outline'}>{src.label}</Badge>
        )}
      </Row>
    </Section>
  )
}
