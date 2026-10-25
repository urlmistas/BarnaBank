import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { botErrorText } from '@/lib/sync/worker'
import { codeLabel, linkCreate, linkRemove, linkStatus, type LinkCode, type LinkStatus } from '@/lib/sync/telegram-link'
import { cn } from '@/lib/utils'
import { DEFAULT_BOT_PREFS, WEEKDAYS, getBotPrefs, hourLabel, putBotPrefs, type BotPrefs } from '@/lib/sync/bot-prefs'
import { Row, Section, Switch } from './layout'

// Telegram por conta: o app gera um código, a pessoa manda no Telegram e o bot passa a guardar os dados dela.
// Só aparece quando o build tem VITE_BOT_URL (bot compartilhado); sem isso fica o modo antigo, com endereço e chave.

const POLL_MS = 3000

function fmtWhen(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

const mmss = (s: number) => String(Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0')

export function TelegramSection({ botUrl, onOwnBot }: { botUrl: string; onOwnBot: () => void }) {
  const { cloud, bot, botToken, setAccountBot, refreshCloud } = useAppData()
  const loggedIn = cloud.status !== 'off'
  const [st, setSt] = useState<LinkStatus | null>(null)
  const [code, setCode] = useState<(LinkCode & { until: number }) | null>(null)
  const [left, setLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetcher = useCallback((url: string, init?: RequestInit) => fetch(url, init), [])
  const check = useCallback(async (): Promise<LinkStatus | null> => {
    try {
      const s = await linkStatus(fetcher, await botToken(), botUrl)
      setSt(s)
      return s
    } catch (e) {
      setErr(botErrorText(e))
      return null
    }
  }, [botToken, botUrl, fetcher])

  // ao abrir (e ao entrar na conta): confere se já está vinculado; vinculado em outro aparelho liga a sincronização aqui
  useEffect(() => {
    if (!loggedIn) return
    let live = true
    void check().then((s) => {
      if (live && s?.linked && !bot.account && bot.status === 'off') setAccountBot(true)
    })
    return () => {
      live = false
    }
    // só quando a conta muda: bot.* muda por causa desta própria chamada
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, check])

  // com o código na tela: confere a cada poucos segundos se o bot já recebeu e conta o tempo
  useEffect(() => {
    if (!code) return
    const tick = () => setLeft(Math.max(0, Math.round((code.until - Date.now()) / 1000)))
    tick()
    const clock = window.setInterval(tick, 1000)
    const poll = window.setInterval(() => {
      if (Date.now() > code.until) return
      void check().then((s) => {
        if (s?.linked) {
          setCode(null)
          setAccountBot(true)
        }
      })
    }, POLL_MS)
    return () => {
      window.clearInterval(clock)
      window.clearInterval(poll)
    }
  }, [code, check, setAccountBot])

  async function generate() {
    setBusy(true)
    setErr(null)
    try {
      const c = await linkCreate(fetcher, await botToken(), botUrl)
      setCode({ ...c, until: Date.now() + c.expiresIn * 1000 })
      setLeft(c.expiresIn)
      setCopied(false)
    } catch (e) {
      setErr(botErrorText(e))
    }
    setBusy(false)
  }

  async function unlink() {
    setBusy(true)
    setErr(null)
    try {
      await linkRemove(fetcher, await botToken(), botUrl)
      setSt((s) => (s ? { ...s, linked: false, at: null } : s))
      setAccountBot(false)
    } catch (e) {
      setErr(botErrorText(e))
    }
    setBusy(false)
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* sem permissão para copiar: o código está na tela */
    }
  }

  const expired = !!code && left === 0
  const errLine = (
    <p role="alert" aria-live="assertive" className={cn('px-4 text-xs text-neg sm:px-5', err ? 'py-2.5' : 'hidden')}>
      {err}
    </p>
  )

  if (!loggedIn) {
    return (
      <Section title="Telegram">
        <Row label="Vincular o Telegram" hint="Entre na sua conta (acima) para lançar gastos e dívidas pelo Telegram.">
          <span />
        </Row>
        <OwnBotRow onClick={onOwnBot} />
      </Section>
    )
  }

  if (st?.linked) {
    const hint =
      bot.status === 'error'
        ? `${bot.error} Seus dados continuam neste aparelho.`
        : bot.status === 'loading'
          ? 'Sincronizando…'
          : [st.bot && '@' + st.bot, st.at && 'vinculado em ' + fmtWhen(st.at)].filter(Boolean).join(' · ') || 'Vinculado.'
    return (
      <Section title="Telegram">
        <Row label="Telegram vinculado" hint={<span className={cn(bot.status === 'error' && 'text-neg')}>{hint}</span>}>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={bot.status === 'loading'} onClick={refreshCloud}>
              <RefreshCw aria-hidden="true" className={cn(bot.status === 'loading' && 'motion-safe:animate-spin')} />
              Sincronizar agora
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={unlink}>
              Desvincular
            </Button>
          </div>
        </Row>
        {errLine}
        <p className="px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
          O que você mandar para o bot entra aqui sozinho. Desvincular não apaga seus dados.
        </p>
      </Section>
    )
  }

  if (code) {
    return (
      <Section title="Telegram">
        <div className="px-4 py-4 sm:px-5">
          <p className="text-sm font-medium">Mande este código para o bot no Telegram</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <output
              aria-label="Código de vínculo"
              className={cn('num rounded-md border border-border-strong bg-surface-2 px-4 py-2 text-2xl font-semibold tracking-[0.18em]', expired && 'text-fg-subtle line-through')}
            >
              {codeLabel(code.code)}
            </output>
            <Button variant="outline" size="sm" onClick={copy} disabled={expired}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            {code.url && !expired && (
              <Button asChild size="sm">
                <a href={code.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Abrir no Telegram
                </a>
              </Button>
            )}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-fg-muted" aria-live="polite">
            {expired ? (
              'O código venceu.'
            ) : (
              <>
                <Loader2 aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
                Esperando você mandar o código… vale por <span className="num">{mmss(left)}</span>
              </>
            )}
          </p>
          <div className="mt-3 flex gap-2">
            {expired && (
              <Button size="sm" disabled={busy} onClick={generate}>
                Gerar outro código
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setCode(null)}>
              Cancelar
            </Button>
          </div>
        </div>
        {errLine}
      </Section>
    )
  }

  return (
    <Section title="Telegram">
      <Row label="Vincular o Telegram" hint="Lance gastos e dívidas conversando com o bot. Cada conta tem os dados separados.">
        <Button size="sm" disabled={busy || !st} onClick={generate}>
          {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          Gerar código
        </Button>
      </Row>
      {errLine}
      <OwnBotRow onClick={onOwnBot} />
    </Section>
  )
}

function OwnBotRow({ onClick }: { onClick: () => void }) {
  return (
    <p className="px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
      Tem um bot próprio?{' '}
      <button type="button" onClick={onClick} className="cursor-pointer underline underline-offset-2 hover:text-fg">
        Conectar com endereço e chave
      </button>
    </p>
  )
}

// ---------------------------------------------------------------- lembretes do bot

const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: hourLabel(h) }))
const DAYS = WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))

/** quais avisos o bot manda e a que horas (valem para o Telegram desta conta; o bot guarda a escolha) */
export function BotPrefsSection() {
  const { botToken } = useAppData()
  const [prefs, setPrefs] = useState<BotPrefs | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const env = useCallback(() => ({ fetcher: (url: string, init?: RequestInit) => fetch(url, init), token: botToken }), [botToken])

  useEffect(() => {
    let live = true
    getBotPrefs(env())
      .then((p) => live && setPrefs(p))
      .catch((e) => live && setErr(botErrorText(e)))
    return () => {
      live = false
    }
  }, [env])

  // muda na tela já e confirma com o bot; se ele recusar, volta ao que era
  async function change(patch: Partial<BotPrefs>) {
    const before = prefs
    setErr(null)
    setPrefs((p) => (p ? { ...p, ...patch } : p))
    try {
      setPrefs(await putBotPrefs(env(), patch))
    } catch (e) {
      setPrefs(before)
      setErr(botErrorText(e))
    }
  }

  const p = prefs ?? DEFAULT_BOT_PREFS
  const off = !prefs
  return (
    <Section title="Lembretes do bot" hint="O bot manda estes avisos no Telegram. Horário de Brasília.">
      <Row label="Horário dos avisos" hint="Hora em que o bot manda os avisos do dia.">
        <Select
          aria-label="Horário dos avisos"
          value={String(p.hour)}
          onChange={(v) => void change({ hour: Number(v) })}
          options={HOURS}
          disabled={off}
          className="sm:w-32"
        />
      </Row>
      <Row label="Resumo do dia" hint="O que vence hoje e amanhã, e o que está atrasado.">
        <Switch label="Resumo do dia" checked={p.daily} onChange={(v) => void change({ daily: v })} />
      </Row>
      <Row label="Resumo da semana" hint="Entradas, gastos e vencimentos dos próximos 7 dias.">
        <div className="flex items-center gap-3">
          <Select
            aria-label="Dia do resumo da semana"
            value={String(p.weekday)}
            onChange={(v) => void change({ weekday: Number(v) })}
            options={DAYS}
            disabled={off || !p.weekly}
            className="w-36"
          />
          <Switch label="Resumo da semana" checked={p.weekly} onChange={(v) => void change({ weekly: v })} />
        </div>
      </Row>
      <Row label="Resumo do mês" hint="No dia 1, como foi o mês que passou.">
        <Switch label="Resumo do mês" checked={p.monthly} onChange={(v) => void change({ monthly: v })} />
      </Row>
      <Row label="Avisar quem me deve" hint="Lembrete no Telegram para quem entrou pelo seu convite: véspera, dia do vencimento e a cada 3 dias de atraso.">
        <Switch label="Avisar quem me deve" checked={p.friends} onChange={(v) => void change({ friends: v })} />
      </Row>
      <p role="alert" aria-live="assertive" className={cn('px-4 text-xs text-neg sm:px-5', err ? 'py-2.5' : 'hidden')}>
        {err}
      </p>
    </Section>
  )
}
