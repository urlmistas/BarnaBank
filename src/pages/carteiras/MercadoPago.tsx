import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { BanknoteCheck, ChartNoAxesCombined, Info, PiggyBank, Loader2, Plus, RefreshCw, RotateCcwClock, SaveCheck, Settings2, Trash, Zap } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import mpLogo from '@/assets/mercadopago.png'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoaderCircleIcon } from '@/components/ui/loader-circle-icon'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/toast'
import { Field, Modal } from '@/components/ui/modal'
import { formatMonths, isMpWallet, potForecast } from '@/lib/finance/mercadopago'
import { TotalChart } from './TotalChart'
import { removeWallet } from '@/lib/finance/wallet-mutations'
import { formatMoneyInput, maskMoney, parseMoney } from '@/lib/money-input'
import { commit } from '@/lib/store'
import { Switch } from '@/pages/configuracoes/layout'
import { mpConfirm, mpFind, mpSave, mpView, type MpConferencia, type MpFound, type MpPot, type MpView } from '@/lib/sync/mpconta'
import { BOT_URL } from '@/lib/sync/telegram-link'
import { botErrorText } from '@/lib/sync/worker'
import { cn } from '@/lib/utils'
import viagem from '@/assets/porquinhos/viagem.png'
import emergencia from '@/assets/porquinhos/emergencia.png'

// Mercado Pago: saldo e porquinhos estimados. O Mercado Pago não entrega saldo nem rendimento, então o dono
// informa os valores de hoje e o bot acompanha as movimentações novas e o CDI. Só aparece para o dono.

// ícone do porquinho pelo nome (sem acento e sem maiúscula); os outros ficam sem ícone
const potIcon = (name: string): string | undefined => {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/deutsch|viagem|travel|alemanha/.test(n)) return viagem
  if (/emerg/.test(n)) return emergencia
  return undefined
}

// "hoje às 23:27", "ontem às 23:27" ou "07/11 às 23:27"
const whenRel = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = (x: Date) => x.toDateString()
  const hoje = new Date()
  const ontem = new Date(hoje.getTime() - 86400000)
  if (dia(d) === dia(hoje)) return 'hoje às ' + hm
  if (dia(d) === dia(ontem)) return 'ontem às ' + hm
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + hm
}

// o que a janela de valores mostra: só a conta, só os porquinhos, ou tudo (primeira configuração)
type Modo = 'conta' | 'porquinhos' | 'tudo'
const HOVER = 'hover:bg-fg/12'

// pergunta se o saldo bate: depois de 1 dia sem confirmar, e no máximo de 12 em 12 horas se for dispensada
const ASK_KEY = 'bb.mp.ask'
const ASK_AFTER = 24 * 3600000
const ASK_SNOOZE = 12 * 3600000

const when = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function MercadoPago() {
  const { cloud, botToken, money, result, canCreate } = useAppData()
  const loggedIn = cloud.status !== 'off'
  const [view, setView] = useState<MpView | { configured: false } | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dlg, setDlg] = useState<Modo | null>(null)
  const [all, setAll] = useState(false)
  const toast = useToast()
  const [respondida, setRespondida] = useState(false)
  const [asking, setAsking] = useState(false)

  const fetcher = useCallback((url: string, init?: RequestInit) => fetch(url, init), [])
  const load = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setView(await mpView(fetcher, await botToken(), undefined, true))
      toast.show('Dados atualizados!', undefined, <SaveCheck aria-hidden="true" />)
    } catch (e) {
      setErr(botErrorText(e))
      setView((v) => v ?? null)
    } finally {
      setBusy(false)
    }
  }, [botToken, fetcher, toast])

  // ao abrir (e ao entrar na conta): busca o estado
  useEffect(() => {
    if (!BOT_URL || !loggedIn) return
    let live = true
    void (async () => {
      try {
        const v = await mpView(fetcher, await botToken())
        if (live) setView(v)
      } catch (e) {
        if (!live) return
        setErr(botErrorText(e))
        setView(null)
      }
    })()
    return () => {
      live = false
    }
  }, [botToken, fetcher, loggedIn])

  const configured = view && view.configured ? view : null
  const data = result?.data

  // o Mercado Pago não é uma carteira do app (o Início soma o total do painel direto): apaga a carteira que uma versão anterior criou sozinha,
  // só se ela tiver apenas lançamentos automáticos (nada que você tenha digitado)
  useEffect(() => {
    if (!data || !canCreate) return
    const w = data.wallets.find(isMpWallet)
    if (!w) return
    if (data.transactions.some((t) => (t.walletId === w.id || t.toWalletId === w.id) && !t.imp?.startsWith('mp:'))) return
    commit((api) => removeWallet(api, w.id))
  }, [data, canCreate])

  // de vez em quando pergunta se o saldo bate com o app (passou um dia da última confirmação e não foi dispensado há pouco)
  const confAt = configured?.conferencia?.at
  const [dispensadoEm, setDispensadoEm] = useState(() => {
    try {
      return Number(localStorage.getItem(ASK_KEY)) || 0
    } catch {
      return 0 // sem armazenamento: pergunta mesmo assim
    }
  })
  const [agora] = useState(() => Date.now())
  const ask = !!confAt && agora - Date.parse(confAt) > ASK_AFTER && agora - dispensadoEm > ASK_SNOOZE && !respondida
  const dismissAsk = () => {
    const t = Date.now()
    try {
      localStorage.setItem(ASK_KEY, String(t))
    } catch {
      /* ignora */
    }
    setDispensadoEm(t)
  }
  const confirmAsk = async () => {
    setAsking(true)
    try {
      setView(await mpConfirm(fetcher, await botToken()))
      setRespondida(true)
      toast.show('Saldo confirmado!')
    } catch (e) {
      toast.show(botErrorText(e))
    } finally {
      setAsking(false)
    }
  }

  if (!BOT_URL || !loggedIn || view === null) return null
  // view undefined = ainda buscando no bot: mostra o esqueleto do card em vez de aparecer de repente
  const loading = view === undefined

  // última movimentação que mexeu na conta (o Guardar ao pagar já aparece nos porquinhos)
  const last = configured?.movs.find((m) => m.tipo !== 'guardar')
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <img src={mpLogo} alt="" aria-hidden="true" className="size-7" />
          Mercado Pago
        </CardTitle>
        <div className="flex items-center gap-1">
          <Tooltip label="Atualizar" side="bottom">
            <Button variant="ghost" size="icon" className={HOVER} aria-label="Atualizar" disabled={busy || loading} onClick={() => void load()}>
              {busy ? <LoaderCircleIcon /> : <RefreshCw />}
            </Button>
          </Tooltip>
          {configured && (
            <Tooltip label="Editar porquinhos" side="bottom">
              <Button variant="ghost" size="icon" className={HOVER} aria-label="Editar porquinhos" onClick={() => setDlg('porquinhos')}>
                <PiggyBank />
              </Button>
            </Tooltip>
          )}
          <Tooltip label={configured ? 'Configurar a carteira' : 'Configurar'} side="bottom" align="end">
            <Button variant="ghost" size="icon" className={HOVER} aria-label={configured ? 'Configurar a carteira' : 'Configurar'} disabled={loading} onClick={() => setDlg(configured ? 'conta' : 'tudo')}>
              <Settings2 />
            </Button>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div role="status" aria-label="Carregando o Mercado Pago">
            <Skeleton className="h-4 w-40" />
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-3 h-8 w-44" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-full" />
              </div>
              <div className="rounded-lg border border-border p-4">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-3 h-8 w-44" />
                <Skeleton className="mt-4 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-full" />
              </div>
            </div>
          </div>
        ) : !configured ? (
          <div>
            <p className="text-sm text-fg-muted">Acompanhe o saldo e os porquinhos da sua conta Mercado Pago. Você informa os valores de hoje e o bot confere as movimentações novas.</p>
            <Button className="mt-3" size="sm" onClick={() => setDlg('tudo')}>
              Configurar
            </Button>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p className="text-xs text-fg-muted">
                Total estimado <span className="num text-fg">{money(configured.total)}</span>
              </p>
              {configured.conferencia && configured.conferencia.total < 1 && (
                <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                  <BanknoteCheck className="size-4 shrink-0 text-pos" aria-hidden="true" />
                  Saldo confirmado. Verificado {whenRel(configured.conferencia.at)}.
                </p>
              )}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <section aria-label="Conta" className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Conta · saldo livre</p>
                <p className="num mt-2 text-3xl font-semibold tracking-tight">{money(configured.saldo)}</p>
                <ul className="mt-3 divide-y divide-border text-sm">
                  <li className="flex items-center justify-between gap-3 py-1.5">
                    <span className="flex items-center gap-2 text-fg-muted">
                      <RotateCcwClock className="size-4 shrink-0" aria-hidden="true" />
                      Última movimentação
                    </span>
                    {last ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className={cn('num', last.sinal > 0 && 'text-pos')}>{(last.sinal > 0 ? '+' : '−') + money(last.valor)}</span>
                        <Tooltip label={last.label + ' · ' + when(last.at)} side="top" align="end" arrowClassName="right-[5px]">
                          <button type="button" aria-label={'Detalhes da última movimentação: ' + last.label + ', ' + when(last.at)} className="inline-flex size-5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg">
                            <Info className="size-4" aria-hidden="true" />
                          </button>
                        </Tooltip>
                      </span>
                    ) : (
                      <span className="text-fg-subtle">nenhuma ainda</span>
                    )}
                  </li>
                  <li className="flex items-center justify-between gap-3 py-1.5">
                    <span className="flex items-center gap-2 text-fg-muted">
                      <ChartNoAxesCombined className="size-4 shrink-0" aria-hidden="true" />
                      Rendimento da conta
                    </span>
                    <span className={configured.saldoPct > 0 ? '' : 'text-fg-subtle'}>{configured.saldoPct > 0 ? configured.saldoPct + '% do CDI' : 'não informado'}</span>
                  </li>
                </ul>
              </section>
              <section aria-label="Porquinhos" className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Guardado nos porquinhos</p>
                <p className="num mt-2 text-3xl font-semibold tracking-tight">{money(configured.pots.reduce((sum, p) => sum + p.valor, 0))}</p>
                {configured.pots.length > 0 && (
                  <ul className="mt-3 divide-y divide-border text-sm">
                    {configured.pots.map((p) => (
                      <Line
                        key={p.id}
                        icon={potIcon(p.name)}
                        label={p.name}
                        value={money(p.valor)}
                        hint={p.pct > 0 ? p.pct + '% do CDI' : undefined}
                        progress={p.meta > 0 ? { pct: Math.min(100, Math.round((p.valor / p.meta) * 100)), text: 'de ' + money(p.meta) } : undefined}
                        forecast={previsao(p, configured, money)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <TotalChart points={configured.historico ?? []} money={money} className="mt-3" />
            {configured.conferencia && <Conferencia c={configured.conferencia} money={money} />}
            {configured.movs.length > 0 && (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                  <RotateCcwClock className="size-4 shrink-0" aria-hidden="true" />
                  Últimas movimentações
                </p>
                <ul className="mt-1 divide-y divide-border text-sm">
                  {(all ? configured.movs : configured.movs.slice(0, 6)).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">
                        {m.label}
                        {m.pot && <span className="text-fg-subtle"> · {configured.pots.find((p) => p.id === m.pot)?.name ?? 'porquinho'}</span>}
                        <span className="text-fg-subtle"> · {when(m.at)}</span>
                      </span>
                      <span className={cn('num shrink-0', m.sinal > 0 && 'text-pos', m.sinal < 0 && 'text-fg-muted')}>{(m.sinal > 0 ? '+' : m.sinal < 0 ? '−' : '') + money(m.valor)}</span>
                    </li>
                  ))}
                </ul>
                {configured.movs.length > 6 && (
                  <Button variant="link" size="sm" className="mt-1" onClick={() => setAll((v) => !v)}>
                    {all ? 'Ver menos' : 'Ver mais'}
                  </Button>
                )}
              </div>
            )}
            {configured.ignoradas.length > 0 && (
              <p className="mt-3 text-xs text-fg-subtle">{configured.ignoradas.length} movimentação(ões) de tipo desconhecido não entraram na conta.</p>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
              <Info className="size-4 shrink-0" aria-hidden="true" />
              Valores estimados com base no CDI. Atualize os dados se houver divergência com o app do Mercado Pago.
            </p>
          </div>
        )}
        {err && (
          <p role="alert" className="mt-3 text-xs text-neg">
            {err}
          </p>
        )}
      </CardContent>
      <Modal open={ask && !!configured && dlg === null} onClose={dismissAsk} title="O saldo está batendo?">
        <div className="p-5">
          <p className="text-sm text-fg-muted">
            Veja no app do Mercado Pago: a conta está com <span className="num text-fg">{money(configured?.saldo ?? 0)}</span> e o total (com os porquinhos) em{' '}
            <span className="num text-fg">{money(configured?.total ?? 0)}</span>?
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-[7px]" onClick={dismissAsk} disabled={asking}>
              Agora não
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-[7px]"
              disabled={asking}
              onClick={() => {
                setRespondida(true)
                setDlg('tudo')
              }}
            >
              Não, ajustar valores
            </Button>
            <Button type="button" className="rounded-[7px]" onClick={() => void confirmAsk()} disabled={asking}>
              {asking ? <Loader2 className="animate-spin" /> : null}
              Sim, está batendo
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={dlg !== null} onClose={() => setDlg(null)} title={dlg === 'porquinhos' ? 'Porquinhos do Mercado Pago' : dlg === 'conta' ? 'Carteira Mercado Pago' : 'Configurar o Mercado Pago'}>
        <SetupForm
          mode={dlg ?? 'tudo'}
          current={configured}
          onClose={() => setDlg(null)}
          onSaved={(v) => {
            setView(v)
            setDlg(null)
          }}
        />
      </Modal>
    </Card>
  )
}

// "Meta batida" ou quanto falta para a meta, no ritmo dos últimos 60 dias
function previsao(p: MpPot, v: MpView, money: (n: number) => string): string | undefined {
  const f = potForecast(p, v.movs, v.cdi)
  if (!f) return p.meta > 0 ? 'Sem previsão: guarde algo para a meta andar.' : undefined
  if ('done' in f) return 'Meta batida!'
  return (f.perMonth > 0 ? 'No ritmo de ' + money(f.perMonth) + '/mês: ' : 'Só com o rendimento: ') + formatMonths(f.months) + ' para a meta.'
}

function Line({ label, value, hint, icon, progress, forecast }: { label: string; value: string; hint?: string; icon?: string; progress?: { pct: number; text: string }; forecast?: string }) {
  return (
    <li className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          {icon && <img src={icon} alt="" aria-hidden="true" className="size-7 shrink-0 object-contain" />}
          <span className="min-w-0 truncate">
            {label}
            {hint && <span className="text-fg-subtle"> · {hint}</span>}
          </span>
        </span>
        <span className="num shrink-0 font-medium">{value}</span>
      </div>
      {progress && (
        <div className={cn('mt-1.5 flex items-center gap-2', icon && 'pl-[38px]')}>
          <div role="progressbar" aria-label={'Meta de ' + label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct} className="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/15">
            <div className="h-full rounded-full bg-[#434ce4] transition-[width]" style={{ width: progress.pct + '%' }} />
          </div>
          <span className="num shrink-0 text-xs text-fg-subtle">
            {progress.pct}% {progress.text}
          </span>
        </div>
      )}
      {forecast && <p className={cn('mt-1 text-xs text-fg-subtle', icon && 'pl-[38px]')}>{forecast}</p>}
    </li>
  )
}

// o quanto a estimativa errou na última vez que o dono informou os valores reais
function Conferencia({ c, money }: { c: MpConferencia; money: (v: number) => string }) {
  // quando bateu, a confirmação aparece na linha do total; aqui só o aviso de diferença
  if (c.total < 1) return null
  const partes = [
    c.saldo.real !== c.saldo.est ? 'conta ' + (c.diff > 0 ? '+' : '−') + money(Math.abs(c.diff)) : '',
    ...c.pots.filter((p) => Math.abs(p.real - p.est) >= 0.01).map((p) => p.name + ' ' + (p.real > p.est ? '+' : '−') + money(Math.abs(p.real - p.est))),
  ].filter(Boolean)
  return (
    <p className="mt-3 rounded-md border border-neg/40 px-3 py-2 text-xs text-neg">
      Conferido em {when(c.at)}: a estimativa estava errada em {money(c.total)} ({partes.join(', ')}). Rendimento e movimentos fora da API explicam a diferença.
    </p>
  )
}

// campo com texto fixo antes (R$) ou depois (% do CDI) do valor
function Affix({ pre, post, className, ...props }: Omit<React.ComponentProps<'input'>, 'prefix'> & { pre?: string; post?: string }) {
  return (
    <label className={cn('flex h-9 min-w-0 cursor-text items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 text-sm transition-colors focus-within:border-border-strong hover:border-border-strong', className)}>
      {pre && <span className="shrink-0 text-xs text-fg-subtle">{pre}</span>}
      <input {...props} className="h-full w-full min-w-0 bg-transparent text-fg outline-none placeholder:text-fg-subtle" />
      {post && <span className="shrink-0 text-xs text-fg-subtle">{post}</span>}
    </label>
  )
}

interface Row {
  id: string
  name: string
  valor: string
  pct: string
  meta: string
  porGasto: number
  /** criado aqui, sem ligação com um porquinho do Mercado Pago (não recebe movimentações sozinho) */
  manual?: boolean
}

function SetupForm({ mode, current, onClose, onSaved }: { mode: Modo; current: MpView | null; onClose: () => void; onSaved: (v: MpView) => void }) {
  // sem configuração ainda, tem que informar tudo
  const showConta = mode !== 'porquinhos' || !current
  const showPots = mode !== 'conta' || !current
  const { botToken } = useAppData()
  const [avisos, setAvisos] = useState(current?.avisos ?? true)
  const saldoId = useId()
  const pctId = useId()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [saldo, setSaldo] = useState(current ? maskMoney(formatMoneyInput(current.saldo)) : '')
  const [saldoPct, setSaldoPct] = useState(current ? String(current.saldoPct) : '0')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // os porquinhos vêm do histórico do Mercado Pago; os que já têm nome mantêm o nome e o rendimento
  useEffect(() => {
    if (!showPots) return
    let live = true
    void (async () => {
      try {
        const { pots } = await mpFind((u, i) => fetch(u, i), await botToken())
        if (!live) return
        const known = new Map<string, MpPot>((current?.pots ?? []).map((p) => [p.id, p]))
        // porquinho antigo, parado e que você não usa mais não precisa aparecer (dá para tirar qualquer um no X)
        const recente = Date.now() - 60 * 86400000
        const ids = new Set([...pots.filter((p) => p.porGasto > 0 || Date.parse(p.ultimo) > recente).map((p) => p.id), ...known.keys()])
        const found = new Map<string, MpFound>(pots.map((p) => [p.id, p]))
        setRows(
          [...ids].map((id) => {
            const k = known.get(id)
            return { id, name: k?.name ?? '', valor: k ? maskMoney(formatMoneyInput(k.valor)) : '', pct: String(k?.pct ?? 120), meta: k?.meta ? maskMoney(formatMoneyInput(k.meta)) : '', porGasto: found.get(id)?.porGasto ?? 0 }
          }),
        )
      } catch (e) {
        if (live) setErr(botErrorText(e))
      }
    })()
    return () => {
      live = false
    }
  }, [botToken, current, showPots])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (showPots && !rows) return
    // o que esta janela não mostra segue como está (a estimativa atual)
    const s = showConta || !current ? parseMoney(saldo) : current.saldo
    if (isNaN(s)) return setErr('Informe o saldo da conta.')
    const sp = showConta || !current ? Number(saldoPct.replace(',', '.')) : current.saldoPct
    if (!isFinite(sp) || sp < 0 || sp > 300) return setErr('Rendimento da conta: de 0 a 300% do CDI.')
    const pots: Record<string, { name: string; valor: number; pct: number; meta: number }> = {}
    if (!showPots && current) for (const p of current.pots) pots[p.id] = { name: p.name, valor: p.valor, pct: p.pct, meta: p.meta }
    for (const r of showPots ? (rows ?? []) : []) {
      const v = parseMoney(r.valor)
      const pct = Number(r.pct.replace(',', '.'))
      if (isNaN(v)) return setErr('Informe o valor de cada porquinho (ou 0).')
      if (!isFinite(pct) || pct < 0 || pct > 300) return setErr('Rendimento do porquinho: de 0 a 300% do CDI.')
      const meta = r.meta.trim() ? parseMoney(r.meta) : 0
      if (isNaN(meta) || meta < 0) return setErr('Meta do porquinho: um valor em R$ (ou deixe em branco).')
      pots[r.id] = { name: r.name.trim() || 'Porquinho ' + r.id.slice(0, 4), valor: v, pct, meta }
    }
    setBusy(true)
    setErr(null)
    try {
      const v = await mpSave((u, i) => fetch(u, i), await botToken(), { saldo: s, saldoPct: sp, pots, carteira: 'nao', avisos })
      onSaved(v)
    } catch (e2) {
      setErr(botErrorText(e2))
      setBusy(false)
    }
  }

  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  return (
    <form onSubmit={(e) => void submit(e)} className="p-5">
      <p className="text-xs text-fg-muted">{mode === 'porquinhos' ? 'Nome, valor, rendimento e meta de cada porquinho. Digite o que o app do Mercado Pago mostra agora, com vírgula nos centavos (ex.: 72,50).' : 'Digite o que o app do Mercado Pago mostra agora, com vírgula nos centavos (ex.: 72,50). A partir daqui o bot soma o que entrar e tirar o que sair.'}</p>
      {showConta && (
        <>
      <div className="mt-4 grid grid-cols-[1fr_88px] gap-3">
        <Field label="Saldo da conta (R$)" htmlFor={saldoId}>
          <Input id={saldoId} inputMode="decimal" value={saldo} onChange={(e) => setSaldo(maskMoney(e.target.value))} placeholder="0,00" />
        </Field>
        <Field label="% do CDI" htmlFor={pctId}>
          <Input id={pctId} inputMode="decimal" value={saldoPct} onChange={(e) => setSaldoPct(e.target.value)} />
        </Field>
      </div>
      <p className="mt-5 text-xs font-medium tracking-wide text-fg-subtle uppercase">Integração</p>
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="text-sm">Avisar no Telegram quando entrar, sair ou for guardado</span>
        <Switch checked={avisos} onChange={setAvisos} label="Avisar no Telegram" />
      </div>
        </>
      )}
      {showPots && (
        <>
      <p className="mt-5 text-xs font-medium tracking-wide text-fg-subtle uppercase">Porquinhos</p>
      {!rows && !err && (
        <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Procurando seus porquinhos…
        </p>
      )}
      {rows && rows.length === 0 && <p className="mt-2 text-sm text-fg-muted">Nenhum porquinho apareceu nas suas movimentações.</p>}
      {rows?.map((r) => {
        const nome = r.name || r.id.slice(0, 4)
        return (
          <div key={r.id} className="mt-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-fg-subtle">
          {r.porGasto > 0 ? (
            <>
              <Zap className="size-3.5 shrink-0 text-accent-text" aria-hidden="true" />
              Recebe {formatMoneyInput(r.porGasto)} a cada gasto (automático)
            </>
          ) : r.manual ? (
            'Porquinho manual: não recebe movimentações sozinho'
          ) : (
            'Porquinho ' + r.id.slice(0, 4)
          )}
        </span>
              <Tooltip label="Excluir porquinho" side="top" align="end">
                <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-1 size-7 hover:bg-fg/12" aria-label={'Excluir o porquinho ' + nome} onClick={() => setRows((rs) => rs && rs.filter((x) => x.id !== r.id))}>
                  <Trash />
                </Button>
              </Tooltip>
            </div>
            <div className="mt-1">
              <label htmlFor={'nome-' + r.id} className="block text-xs font-medium text-fg-muted">
                Nome
              </label>
              <Input id={'nome-' + r.id} className="mt-1" placeholder="Ex.: Viagem" value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} />
            </div>
            <div className="mt-2 grid grid-cols-[0.9fr_1fr_1.45fr] gap-2">
              <Affix pre="R$" aria-label={'Valor do porquinho ' + nome} inputMode="decimal" placeholder="0,00" value={r.valor} onChange={(e) => set(r.id, { valor: maskMoney(e.target.value) })} />
              <Affix post="% do CDI" aria-label={'Rendimento do porquinho ' + nome + ' (% do CDI)'} inputMode="decimal" placeholder="120" value={r.pct} onChange={(e) => set(r.id, { pct: e.target.value })} />
              <Affix pre="Meta R$" aria-label={'Meta do porquinho ' + nome} inputMode="decimal" placeholder="0,00" value={r.meta} onChange={(e) => set(r.id, { meta: maskMoney(e.target.value) })} />
            </div>
          </div>
        )
      })}
      {rows && (
        <Button type="button" variant="outline" size="sm" className="mt-3 w-full rounded-[7px] hover:bg-fg/12" onClick={() => setRows((rs) => [...(rs ?? []), { id: crypto.randomUUID(), name: '', valor: '', pct: '120', meta: '', porGasto: 0, manual: true }])}>
          <Plus aria-hidden="true" />
          Adicionar novo porquinho
        </Button>
      )}
        </>
      )}
      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
        {err}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="rounded-[7px]" disabled={(showPots && !rows) || busy}>
          {busy ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}
