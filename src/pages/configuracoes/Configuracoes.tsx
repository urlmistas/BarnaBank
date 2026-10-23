import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useTheme, THEME_PREFS, type ThemePref } from '@/app/theme'
import { AccountDialog } from '@/app/AccountDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { CURRENCIES, DATE_FORMATS, type Currency, type DateFormat } from '@/lib/prefs'
import { cn } from '@/lib/utils'

// Configurações: conta e nuvem, bot, tema, formatos e origem dos dados.

const THEME_LABEL: Record<ThemePref, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' }

export function Configuracoes() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-fg-muted">Conta, bot, tema e formatos deste app.</p>

      <div className="mt-6 flex flex-col gap-6">
        <AccountSection />
        <BotSection />
        <AppearanceSection />
        <FormatSection />
        <DataSection />
      </div>

      <p className="num mt-8 text-center text-xs text-fg-subtle">
        BarnaBank · versão {__APP_VERSION__} · {__BUILD_DATE__.split('-').reverse().join('/')}
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-2 px-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">{children}</div>
    </section>
  )
}

/** linha: rótulo e explicação à esquerda, controle à direita (no celular, controle embaixo) */
function Row({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  const L = htmlFor ? 'label' : 'p'
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0">
        <L {...(htmlFor ? { htmlFor } : {})} className="block text-sm font-medium">
          {label}
        </L>
        {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function fmtWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function AccountSection() {
  const { cloud, conflict, setConflictOpen, refreshCloud, signOut } = useAppData()
  const ref = useRef<HTMLDialogElement>(null)
  const on = cloud.status !== 'off'
  const hint = !on
    ? (cloud.error ?? 'Entre com o e-mail e a senha do BarnaBank para guardar os dados na conta e ver em qualquer aparelho.')
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
      <AccountDialog dialogRef={ref} />
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

function Select<T extends string>({
  id,
  value,
  onChange,
  options,
}: {
  id: string
  value: T | ''
  onChange: (v: T | '') => void
  options: { value: T | ''; label: string }[]
}) {
  return (
    <div className="relative w-full sm:w-72">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T | '')}
        className="h-9 w-full cursor-pointer appearance-none rounded-sm border border-border bg-surface pr-9 pl-3 text-sm text-fg transition-colors outline-none hover:border-border-strong focus-visible:border-border-strong"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle" />
    </div>
  )
}

function FormatSection() {
  const { prefs, setPrefs, baseSettings, money, date, today } = useAppData()
  const curId = useId()
  const dateId = useId()
  const baseCur = CURRENCIES.find((c) => c.value === baseSettings.currency)?.label ?? baseSettings.currency
  const baseDate = DATE_FORMATS.find((d) => d.value === baseSettings.dateFormat)?.label ?? 'DD/MM/AA'
  const custom = !!(prefs.currency || prefs.dateFormat)
  return (
    <Section title="Formatos">
      <Row label="Moeda" htmlFor={curId}>
        <Select<Currency>
          id={curId}
          value={prefs.currency ?? ''}
          onChange={(v) => setPrefs({ ...prefs, currency: v || undefined })}
          options={[{ value: '', label: `Como no BarnaBank · ${baseCur}` }, ...CURRENCIES]}
        />
      </Row>
      <Row label="Data" htmlFor={dateId}>
        <Select<DateFormat>
          id={dateId}
          value={prefs.dateFormat ?? ''}
          onChange={(v) => setPrefs({ ...prefs, dateFormat: v || undefined })}
          options={[{ value: '', label: `Como no BarnaBank · ${baseDate}` }, ...DATE_FORMATS]}
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
