import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { ChartNoAxesCombined, Loader2, Receipt, RefreshCw, Settings2, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { MercadoPagoLogo } from '@/components/mercado-pago-logo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { formatMoneyInput, parseMoney } from '@/lib/money-input'
import { mpFind, mpSave, mpView, type MpFound, type MpPot, type MpView } from '@/lib/sync/mpconta'
import { BOT_URL } from '@/lib/sync/telegram-link'
import { botErrorText } from '@/lib/sync/worker'
import { cn } from '@/lib/utils'
import viagem from '@/assets/porquinhos/viagem.webp'
import emergencia from '@/assets/porquinhos/emergencia.webp'

// Mercado Pago: saldo e porquinhos estimados. O Mercado Pago não entrega saldo nem rendimento, então o dono
// informa os valores de hoje e o bot acompanha as movimentações novas e o CDI. Só aparece para o dono.

// ícone do porquinho pelo nome (sem acento e sem maiúscula); os outros ficam sem ícone
const potIcon = (name: string): string | undefined => {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/deutsch|viagem|travel|alemanha/.test(n)) return viagem
  if (/emerg/.test(n)) return emergencia
  return undefined
}

const when = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function MercadoPago() {
  const { cloud, botToken, money } = useAppData()
  const loggedIn = cloud.status !== 'off'
  const [view, setView] = useState<MpView | { configured: false } | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dlg, setDlg] = useState(false)
  const [all, setAll] = useState(false)

  const fetcher = useCallback((url: string, init?: RequestInit) => fetch(url, init), [])
  const load = useCallback(async () => {
    setBusy(true)
    setErr(null)
    try {
      setView(await mpView(fetcher, await botToken()))
    } catch (e) {
      setErr(botErrorText(e))
      setView((v) => v ?? null)
    } finally {
      setBusy(false)
    }
  }, [botToken, fetcher])

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

  if (!BOT_URL || !loggedIn || !view) return null

  const configured = view.configured ? view : null
  // última movimentação que mexeu na conta (o Guardar ao pagar já aparece nos porquinhos)
  const last = configured?.movs.find((m) => m.tipo !== 'guardar')
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <MercadoPagoLogo className="size-7 text-[#00b1ea]" />
          Mercado Pago
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Atualizar" disabled={busy} onClick={() => void load()}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
          <Button variant="ghost" size="icon" aria-label={configured ? 'Informar valores de hoje' : 'Configurar'} onClick={() => setDlg(true)}>
            <Settings2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!configured ? (
          <div>
            <p className="text-sm text-fg-muted">Acompanhe o saldo e os porquinhos da sua conta Mercado Pago. Você informa os valores de hoje e o bot confere as movimentações novas.</p>
            <Button className="mt-3" size="sm" onClick={() => setDlg(true)}>
              Configurar
            </Button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-fg-muted">
              Total estimado <span className="num text-fg">{money(configured.total)}</span>
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <section aria-label="Conta" className="rounded-lg border border-border p-4">
                <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Conta · saldo livre</p>
                <p className="num mt-2 text-3xl font-semibold tracking-tight">{money(configured.saldo)}</p>
                <ul className="mt-3 divide-y divide-border text-sm">
                  <li className="flex items-center justify-between gap-3 py-1.5">
                    <span className="flex items-center gap-2 text-fg-muted">
                      <Receipt className="size-4 shrink-0" aria-hidden="true" />
                      Última movimentação
                    </span>
                    <span className="min-w-0 truncate text-right">
                      {last ? (
                        <>
                          <span className={cn('num', last.sinal > 0 && 'text-pos')}>{(last.sinal > 0 ? '+' : '−') + money(last.valor)}</span>
                          <span className="text-fg-subtle"> · {last.label} · {when(last.at)}</span>
                        </>
                      ) : (
                        <span className="text-fg-subtle">nenhuma ainda</span>
                      )}
                    </span>
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
                      <Line key={p.id} icon={potIcon(p.name)} label={p.name} value={money(p.valor)} hint={p.pct > 0 ? p.pct + '% do CDI' : undefined} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
            {configured.movs.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-fg-subtle uppercase">Últimas movimentações</p>
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
            <p className="mt-3 text-xs text-fg-subtle">
              Desde {when(configured.since)}. O rendimento usa o CDI até {configured.yieldDate.split('-').reverse().join('/')}. Valores estimados: quando o app do Mercado Pago mostrar outro número, informe de novo.
            </p>
          </div>
        )}
        {err && (
          <p role="alert" className="mt-3 text-xs text-neg">
            {err}
          </p>
        )}
      </CardContent>
      <Modal open={dlg} onClose={() => setDlg(false)} title="Valores de hoje do Mercado Pago">
        <SetupForm
          current={configured}
          onClose={() => setDlg(false)}
          onSaved={(v) => {
            setView(v)
            setDlg(false)
          }}
        />
      </Modal>
    </Card>
  )
}

function Line({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex min-w-0 items-center gap-2.5">
        {icon && <img src={icon} alt="" aria-hidden="true" className="size-7 shrink-0 object-contain" />}
        <span className="min-w-0 truncate">
          {label}
          {hint && <span className="text-fg-subtle"> · {hint}</span>}
        </span>
      </span>
      <span className="num shrink-0 font-medium">{value}</span>
    </li>
  )
}

interface Row {
  id: string
  name: string
  valor: string
  pct: string
  porGasto: number
}

function SetupForm({ current, onClose, onSaved }: { current: MpView | null; onClose: () => void; onSaved: (v: MpView) => void }) {
  const { botToken } = useAppData()
  const saldoId = useId()
  const pctId = useId()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [saldo, setSaldo] = useState(current ? formatMoneyInput(current.saldo) : '')
  const [saldoPct, setSaldoPct] = useState(current ? String(current.saldoPct) : '0')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // os porquinhos vêm do histórico do Mercado Pago; os que já têm nome mantêm o nome e o rendimento
  useEffect(() => {
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
            return { id, name: k?.name ?? '', valor: k ? formatMoneyInput(k.valor) : '', pct: String(k?.pct ?? 120), porGasto: found.get(id)?.porGasto ?? 0 }
          }),
        )
      } catch (e) {
        if (live) setErr(botErrorText(e))
      }
    })()
    return () => {
      live = false
    }
  }, [botToken, current])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!rows) return
    const s = parseMoney(saldo)
    if (isNaN(s)) return setErr('Informe o saldo da conta.')
    const sp = Number(saldoPct.replace(',', '.'))
    if (!isFinite(sp) || sp < 0 || sp > 300) return setErr('Rendimento da conta: de 0 a 300% do CDI.')
    const pots: Record<string, { name: string; valor: number; pct: number }> = {}
    for (const r of rows) {
      const v = parseMoney(r.valor)
      const pct = Number(r.pct.replace(',', '.'))
      if (isNaN(v)) return setErr('Informe o valor de cada porquinho (ou 0).')
      if (!isFinite(pct) || pct < 0 || pct > 300) return setErr('Rendimento do porquinho: de 0 a 300% do CDI.')
      pots[r.id] = { name: r.name.trim() || 'Porquinho ' + r.id.slice(0, 4), valor: v, pct }
    }
    setBusy(true)
    setErr(null)
    try {
      onSaved(await mpSave((u, i) => fetch(u, i), await botToken(), { saldo: s, saldoPct: sp, pots }))
    } catch (e2) {
      setErr(botErrorText(e2))
      setBusy(false)
    }
  }

  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  return (
    <form onSubmit={(e) => void submit(e)} className="p-5">
      <p className="text-xs text-fg-muted">Digite o que o app do Mercado Pago mostra agora. A partir daqui o bot soma o que entrar e tirar o que sair.</p>
      <div className="mt-4 grid grid-cols-[1fr_88px] gap-3">
        <Field label="Saldo da conta (R$)" htmlFor={saldoId}>
          <Input id={saldoId} inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="% do CDI" htmlFor={pctId}>
          <Input id={pctId} inputMode="decimal" value={saldoPct} onChange={(e) => setSaldoPct(e.target.value)} />
        </Field>
      </div>
      <p className="mt-5 text-xs font-medium tracking-wide text-fg-subtle uppercase">Porquinhos</p>
      {!rows && !err && (
        <p className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Procurando seus porquinhos…
        </p>
      )}
      {rows && rows.length === 0 && <p className="mt-2 text-sm text-fg-muted">Nenhum porquinho apareceu nas suas movimentações.</p>}
      {rows?.map((r) => (
        <div key={r.id} className="mt-3 grid grid-cols-[1fr_1fr_72px_auto] gap-2">
          <div className="col-span-4 text-xs text-fg-subtle">{r.porGasto > 0 ? 'Recebe ' + formatMoneyInput(r.porGasto) + ' a cada gasto' : 'Porquinho ' + r.id.slice(0, 4)}</div>
          <Input aria-label={'Nome do porquinho ' + r.id.slice(0, 4)} placeholder="Nome" value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} />
          <Input aria-label={'Valor do porquinho ' + (r.name || r.id.slice(0, 4))} inputMode="decimal" placeholder="Valor" value={r.valor} onChange={(e) => set(r.id, { valor: e.target.value })} />
          <Input aria-label={'% do CDI do porquinho ' + (r.name || r.id.slice(0, 4))} inputMode="decimal" value={r.pct} onChange={(e) => set(r.id, { pct: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" aria-label={'Tirar o porquinho ' + (r.name || r.id.slice(0, 4))} onClick={() => setRows((rs) => rs && rs.filter((x) => x.id !== r.id))}>
            <X />
          </Button>
        </div>
      ))}
      <p role="alert" aria-live="assertive" className="mt-3 min-h-5 text-xs text-neg">
        {err}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!rows || busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}
