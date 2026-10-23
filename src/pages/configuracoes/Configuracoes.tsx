import { useId, useRef, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, RefreshCw } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useTheme, THEME_PREFS, type ThemePref } from '@/app/theme'
import { AccountDialog } from '@/app/AccountDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { CURRENCIES, DATE_FORMATS, type Currency, type DateFormat } from '@/lib/prefs'
import { cn } from '@/lib/utils'

// Configurações: só o que vale para este app (somente leitura).
// Ficaram no BarnaBank atual, porque só servem para criar/editar: juros/multa/mora padrão, PIX,
// carteira padrão, confirmação ao excluir, lembrete e importação de backup.

const OLD_APP_URL = 'https://urlmistas.github.io/barna-bank/'
const THEME_LABEL: Record<ThemePref, string> = { system: 'Sistema', light: 'Claro', dark: 'Escuro' }

export function Configuracoes() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <p className="mt-1 text-sm text-fg-muted">Valem só para este app. Nada aqui altera os seus dados.</p>

      <div className="mt-6 flex flex-col gap-6">
        <AccountSection />
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
  const { cloud, refreshCloud, signOut } = useAppData()
  const ref = useRef<HTMLDialogElement>(null)
  const on = cloud.status !== 'off'
  const hint = !on
    ? (cloud.error ?? 'Entre com o e-mail e a senha do BarnaBank para ver os dados da sua conta em qualquer aparelho.')
    : cloud.status === 'loading'
      ? 'Baixando os dados da conta…'
      : cloud.status === 'error'
        ? `${cloud.error} Mostrando os dados deste aparelho.`
        : cloud.empty
          ? 'A conta ainda não tem dados. Mostrando os dados deste aparelho.'
          : `Dados da conta salvos em ${fmtWhen(cloud.updatedAt)}.`
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
                Atualizar
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
        {on && (
          <p className="px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
            Só leitura: para editar, use o BarnaBank atual e toque em Atualizar. Sair aqui não desconecta o app atual.
          </p>
        )}
      </Section>
      {/* fora da lista com divisórias: o <dialog> não pode virar uma linha dela */}
      <AccountDialog dialogRef={ref} />
    </>
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
  cloud: { label: 'Conta na nuvem', hint: 'Baixados da sua conta ao abrir o app. Ficam só na memória.' },
  local: { label: 'Este aparelho', hint: 'Os mesmos dados do BarnaBank atual neste navegador.' },
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
      <Row label="Editar dados" hint="Criar, pagar, excluir, backup e o resto das configurações continuam no BarnaBank atual.">
        <Button asChild variant="outline" size="sm">
          <a href={OLD_APP_URL} target="_blank" rel="noopener noreferrer">
            Abrir o BarnaBank atual
            <ArrowUpRight aria-hidden="true" />
            <span className="sr-only">(abre em outra aba)</span>
          </a>
        </Button>
      </Row>
    </Section>
  )
}
