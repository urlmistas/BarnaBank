import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, Ellipsis, MessageCircle, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Menu } from '@/components/ui/menu'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { EPS } from '@/lib/finance/dates'
import { makeDebtCalc, paidAmount, type DebtCalc } from '@/lib/finance/debts'
import {
  deleteGroup, groupChargeText, groupData, groupMatches, groupStats, memberState, type GroupData, type GroupFilter, type GroupStats,
} from '@/lib/finance/groups'
import { whatsappLink } from '@/lib/finance/whatsapp'
import { initials } from '@/lib/finance/people'
import { plural } from '@/lib/format'
import { shareLinkFor } from '@/lib/shares/shares'
import { useBotCfg, useShares } from '@/lib/shares/use-shares'
import { botOn } from '@/lib/sync/worker'
import { contactKey } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { Debt } from '@/lib/types'
import { personHref } from '../links'
import { ConfirmDialog } from '../dialogs'
import { ShareButton } from '../share-dialog'
import { GroupFormDialog } from './GroupFormDialog'

// Dívidas em grupo (vaquinha / conta dividida) na tela Pessoas: um cartão por grupo, com quem já pagou e quem falta.
// Cada participante também aparece na lista de pessoas, com a dívida dele.

export function GroupsSection({ filter, query }: { filter: GroupFilter; query: string }) {
  const { result, today, canCreate } = useAppData()
  const [creating, setCreating] = useState(false)
  const data = result?.data
  const calc = useMemo(() => makeDebtCalc(today), [today])
  const items = useMemo(() => {
    if (!data) return []
    return data.groups
      .map((g) => {
        const gd = groupData(g)
        return { g: gd, st: groupStats(data.debts, gd.id, calc) }
      })
      .filter((x) => groupMatches(x.g, x.st, filter, query))
      .sort((a, b) => (a.g.date < b.g.date ? 1 : a.g.date > b.g.date ? -1 : 0))
  }, [data, calc, filter, query])

  if (!data || (!items.length && !canCreate)) return null
  return (
    <section aria-label="Grupos" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-fg-subtle uppercase">{items.length ? plural(items.length, 'grupo', 'grupos') : 'Grupos'}</h2>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" /> Dívida em grupo
          </Button>
        )}
      </div>
      {items.map(({ g, st }) => (
        <GroupCard key={g.id} g={g} st={st} calc={calc} />
      ))}
      <GroupFormDialog open={creating} onClose={() => setCreating(false)} />
    </section>
  )
}

function GroupCard({ g, st, calc }: { g: GroupData; st: GroupStats; calc: DebtCalc }) {
  const { money, date, canEdit, result } = useAppData()
  const [open, setOpen] = useState(false)
  const [dlg, setDlg] = useState<'edit' | 'delete' | 'charge' | null>(null)
  const bodyId = useId()
  const pay = g.kind === 'payable'
  const n = st.members.length
  const pct = st.owed > 0 ? Math.max(0, Math.min(100, (st.paid / st.owed) * 100)) : 0
  const wallet = g.walletId ? result?.data.wallets.find((w) => w.id === g.walletId) : undefined
  const close = () => setDlg(null)

  let badge: string
  if (!n) badge = 'Sem participantes'
  else if (st.remaining <= EPS) badge = 'Quitado'
  else if (st.late) badge = st.late === 1 ? '1 atrasado' : `${st.late} atrasados`
  else badge = `${st.done}/${n} ${pay ? 'pagos' : 'pagaram'}`

  let meta = ''
  if (g.includeMe && g.myShare > EPS) meta = `Conta total ${money(g.total)} · sua parte ${money(g.myShare)}`
  else if (Math.abs(g.total - st.owed) > 0.009 && n) meta = `Total combinado ${money(g.total)}`

  return (
    <Card aria-label={`Grupo ${g.title}`} className="overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-fg-muted">
          <Users className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{g.title}</span>
          <span className="block truncate text-xs text-fg-subtle">
            <span className="num">{date(g.date)}</span> · {plural(n, 'pessoa', 'pessoas')}
            {g.dueDate && <> · pagar até <span className="num">{date(g.dueDate)}</span></>}
          </span>
        </span>
        <Badge className={cn(st.late > 0 && 'border-neg/40 text-neg')}>{badge}</Badge>
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {n > 0 && (
        <div className="px-4 pb-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              <b className="num font-semibold">{money(st.paid)}</b> <span className="text-xs text-fg-muted">de <span className="num">{money(st.owed)}</span> {pay ? 'pagos' : 'recebidos'}</span>
            </span>
            <span className="num text-xs text-fg-muted">{Math.round(pct)}%</span>
          </div>
          <div role="progressbar" aria-label={pay ? 'Quanto já paguei' : 'Quanto já recebi'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          {meta && <p className="mt-1.5 text-xs text-fg-subtle">{meta}</p>}
        </div>
      )}

      {open && (
        <div id={bodyId} className="border-t border-border">
          <ul aria-label={`Participantes de ${g.title}`}>
            {st.members.map((d) => (
              <MemberRow key={d.id} d={d} calc={calc} pay={pay} />
            ))}
            {g.includeMe && g.myShare > EPS && (
              <li className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-xs text-fg-muted">EU</span>
                <span className="min-w-0 flex-1">Você <span className="text-xs text-fg-subtle">· sua parte, fica fora da cobrança</span></span>
                <span className="num text-sm">{money(g.myShare)}</span>
              </li>
            )}
            {!n && <li className="px-4 py-4 text-sm text-fg-muted">Ninguém neste grupo. Use Editar grupo para adicionar pessoas.</li>}
          </ul>
          {wallet && <p className="px-4 py-2 text-xs text-fg-muted">Pagamentos caem em: <b className="text-fg">{wallet.name}</b></p>}
          {g.notes && <p className="px-4 pb-2 text-xs text-fg-muted"><b className="text-fg">Anotações</b> {g.notes}</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            {!pay && st.remaining > EPS && (
              <Button size="sm" variant="outline" onClick={() => setDlg('charge')}>
                <MessageCircle aria-hidden="true" /> Cobrar pendentes
              </Button>
            )}
            {n > 0 && !pay && <ShareButton type="group" refKey={g.id} label={g.title} variant="outline" />}
            {canEdit && (
              <Menu
                className="ml-auto"
                label={`Mais ações do grupo ${g.title}`}
                trigger={<Ellipsis aria-hidden="true" />}
                items={[
                  { label: 'Editar grupo', icon: <Pencil aria-hidden="true" />, onSelect: () => setDlg('edit') },
                  { label: 'Excluir grupo', icon: <Trash2 aria-hidden="true" />, danger: true, onSelect: () => setDlg('delete') },
                ]}
              />
            )}
          </div>
        </div>
      )}

      <GroupFormDialog open={dlg === 'edit'} onClose={close} group={g} />
      {dlg === 'delete' && <GroupDelete g={g} members={st.members} onClose={close} />}
      {dlg === 'charge' && <GroupCharge g={g} st={st} calc={calc} onClose={close} />}
    </Card>
  )
}

function MemberRow({ d, calc, pay }: { d: Debt; calc: DebtCalc; pay: boolean }) {
  const { money } = useAppData()
  const s = memberState(d, calc)
  const rem = calc.remaining(d)
  const paid = paidAmount(d)
  let text: string
  if (s === 'pago') text = pay ? 'pago' : 'pagou'
  else {
    text = (paid > EPS ? `${pay ? 'já paguei' : 'pagou'} ${money(paid)} · ` : '') + `falta ${money(rem)}`
    if (s === 'atrasado') text += ' · atrasado'
  }
  return (
    <li className="flex items-center gap-3 border-b border-border px-4 py-2">
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-xs text-fg-muted">
        {initials(d.name)}
      </span>
      <span className="min-w-0 flex-1">
        <Link to={personHref(contactKey(d.name), '')} className="block truncate text-sm font-medium hover:underline">
          {d.name}
        </Link>
        <span className={cn('flex items-center gap-1 text-xs', s === 'atrasado' ? 'text-neg' : 'text-fg-subtle')}>
          {s === 'pago' && <Check aria-hidden="true" className="size-3" />}
          {text}
        </span>
      </span>
      <span className="num text-sm">{money(calc.effectiveTotal(d))}</span>
    </li>
  )
}

function GroupDelete({ g, members, onClose }: { g: GroupData; members: Debt[]; onClose: () => void }) {
  const { money } = useAppData()
  const write = useWrite()
  const paidSum = members.reduce((s, d) => s + paidAmount(d), 0)
  const remove = (keep: boolean) =>
    write(
      keep ? 'Grupo excluído. As dívidas continuam como individuais.' : `Grupo excluído${members.length ? ` com ${plural(members.length, 'dívida', 'dívidas')}` : ''}`,
      (api) => {
        api.debts = deleteGroup(api.debts, g.id, keep)
        api.groups = api.groups.filter((x) => x.id !== g.id)
      },
      'Grupo restaurado',
    )
  if (!members.length) {
    return (
      <ConfirmDialog open onClose={onClose} title="Excluir grupo" okLabel="Apagar grupo" onOk={() => remove(false)}>
        O grupo <b className="text-fg">{g.title}</b> não tem ninguém. Ele será apagado.
      </ConfirmDialog>
    )
  }
  return (
    <Modal open onClose={onClose} title="Excluir grupo">
      <div className="px-5 py-4 text-sm text-fg-muted">
        <p>
          O grupo <b className="text-fg">{g.title}</b> tem {plural(members.length, 'dívida', 'dívidas')}. O que fazer com {members.length === 1 ? 'ela' : 'elas'}?
        </p>
        {paidSum > EPS && <p className="mt-2">Se apagar tudo, os pagamentos já registrados (<span className="num">{money(paidSum)}</span>) também somem.</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              remove(true)
              onClose()
            }}
          >
            Manter as dívidas
          </Button>
          <Button
            className="bg-neg text-white hover:bg-neg/90"
            onClick={() => {
              remove(false)
              onClose()
            }}
          >
            Apagar grupo e dívidas
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function GroupCharge({ g, st, calc, onClose }: { g: GroupData; st: GroupStats; calc: DebtCalc; onClose: () => void }) {
  const { money, date, today, baseSettings, result } = useAppData()
  const toast = useToast()
  const shares = useShares()
  const cfg = useBotCfg()
  const link = botOn(cfg) ? shareLinkFor(shares, cfg.url, 'group', g.id) : ''
  const initial = useMemo(
    () => groupChargeText(g, st, calc, { money, date, pixKey: typeof baseSettings.pixKey === 'string' ? baseSettings.pixKey : '', link }),
    [g, st, calc, money, date, baseSettings.pixKey, link],
  )
  const [text, setText] = useState(initial.text)
  const msgId = useId()
  const contacts = result?.data.contacts ?? {}
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.show('Mensagem copiada.')
    } catch {
      toast.show('Não consegui copiar. Selecione o texto e copie.')
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cobrar pendentes · ${g.title}`}>
      <div className="px-5 py-4">
        <ul aria-label="Pendentes" className="rounded-md border border-border">
          {initial.pend.length === 0 && <li className="px-3 py-3 text-sm text-fg-muted">Ninguém pendente.</li>}
          {initial.pend.map((d) => {
            const pixKey = typeof baseSettings.pixKey === 'string' ? baseSettings.pixKey : ''
            const personLink = botOn(cfg) ? shareLinkFor(shares, cfg.url, 'person', contactKey(d.name)) : ''
            const waHref = whatsappLink(d, contacts[contactKey(d.name)], { today, money, date, pixKey, link: personLink, groupTitle: g.title })
            return (
              <li key={d.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                <span className="min-w-0 flex-1 text-sm">
                  <b className="font-medium">{d.name}</b> <span className="num text-fg-muted">{money(calc.remaining(d))}</span>
                </span>
                {waHref ? (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp<span className="sr-only"> para {d.name} (abre em outra aba)</span>
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-fg-subtle">sem telefone</span>
                )}
              </li>
            )
          })}
        </ul>
        <label htmlFor={msgId} className="mt-4 block text-xs font-medium text-fg-muted">
          Mensagem para o grupo
        </label>
        <textarea
          id={msgId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          className="mt-1 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-fg outline-none hover:border-border-strong focus-visible:border-border-strong"
        />
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="outline" onClick={() => void copy()}>
            Copiar
          </Button>
          <Button asChild>
            <a href={'https://wa.me/?text=' + encodeURIComponent(text)} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" /> WhatsApp do grupo<span className="sr-only"> (abre em outra aba)</span>
            </a>
          </Button>
        </div>
      </div>
    </Modal>
  )
}
