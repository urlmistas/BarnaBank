import { useState } from 'react'
import { Minus, Pencil, PiggyBank, Plus, Repeat, Target } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { budgetStatus, overCount, type BudgetRow } from '@/lib/finance/budgets'
import { goalInfo, goalSub } from '@/lib/finance/goals'
import { sortedRecurring } from '@/lib/finance/recurring'
import { cn } from '@/lib/utils'
import type { AppData, Goal, Recurring, YearMonth } from '@/lib/types'
import { BudgetDialog, GoalDialog, GoalMoveDialog, RecurringDialog } from './plan-dialogs'
import { useRunRecurring } from './use-run-recurring'

// Planejamento, embaixo dos Relatórios: orçamento do mês, metas e lançamentos recorrentes.

const CLS_BAR: Record<BudgetRow['cls'], string> = { ok: 'bg-accent', warn: 'bg-amber-500', over: 'bg-neg' }

export function PlanSections({ data, today, month }: { data: AppData; today: string; month: YearMonth }) {
  useRunRecurring()
  return (
    <div className="mt-8 flex flex-col gap-6">
      <BudgetCard data={data} today={today} month={month} />
      <GoalsCard data={data} today={today} />
      <RecurringCard data={data} />
    </div>
  )
}

// ---------------------------------------------------------------- orçamento

function BudgetCard({ data, today, month }: { data: AppData; today: string; month: YearMonth }) {
  const { money, canEdit } = useAppData()
  const [open, setOpen] = useState(false)
  const rows = budgetStatus(data, month, today)
  const over = overCount(rows)
  return (
    <Card aria-label="Orçamento do mês">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Target aria-hidden="true" className="size-4 text-fg-subtle" />
            Orçamento do mês
          </CardTitle>
          {rows.length > 0 && (
            <p className="mt-0.5 text-xs text-fg-subtle">{over ? `${over} ${over === 1 ? 'estourou' : 'estouraram'} o limite` : 'tudo dentro do limite'}</p>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Pencil aria-hidden="true" />
            {rows.length ? 'Editar' : 'Definir'}
          </Button>
        )}
      </CardHeader>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-muted">
          Defina um teto por categoria (ex.: Mercado R$ 600, Lazer R$ 300) e acompanhe aqui quanto ainda pode gastar no mês. Compras no cartão contam.
        </p>
      ) : (
        <ul className="flex flex-col gap-4 px-5 pb-5">
          {rows.map((r) => {
            const hint =
              r.cls === 'over'
                ? `Passou ${money(-r.left)} do limite`
                : r.perDay
                  ? `Restam ${money(r.left)} · dá ${money(r.perDay)}/dia até o fim do mês`
                  : `Restam ${money(r.left)}`
            return (
              <li key={r.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{r.name}</span>
                  <span className="num shrink-0 text-xs text-fg-muted">
                    <b className="text-fg">{money(r.spent)}</b> de {money(r.limit)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`Gasto em ${r.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, r.pct))}
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <div className={cn('h-full rounded-full', CLS_BAR[r.cls])} style={{ width: `${Math.min(100, r.pct)}%` }} />
                </div>
                <p className={cn('num mt-1 text-xs', r.cls === 'over' ? 'text-neg' : 'text-fg-subtle')}>{hint}</p>
              </li>
            )
          })}
        </ul>
      )}
      <BudgetDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

// ---------------------------------------------------------------- metas

function GoalsCard({ data, today }: { data: AppData; today: string }) {
  const { canEdit, canCreate } = useAppData()
  const goals = data.goals ?? []
  const [dlg, setDlg] = useState<{ kind: 'new' } | { kind: 'edit'; goal: Goal } | { kind: 'move'; goal: Goal; take: boolean } | null>(null)
  const close = () => setDlg(null)
  const done = goals.filter((g) => goalInfo(data, g, today).done).length
  return (
    <Card aria-label="Metas">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <PiggyBank aria-hidden="true" className="size-4 text-fg-subtle" />
            Metas
          </CardTitle>
          {goals.length > 0 && <p className="mt-0.5 text-xs text-fg-subtle">{done}/{goals.length} batidas</p>}
        </div>
        {canCreate && (
          <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'new' })}>
            <Plus aria-hidden="true" />
            Nova meta
          </Button>
        )}
      </CardHeader>
      {goals.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-muted">
          Viagem, reserva de emergência, um celular novo… Crie uma meta e o BarnaBank mostra quanto guardar por mês.
        </p>
      ) : (
        <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalItem
              key={g.id}
              data={data}
              goal={g}
              today={today}
              canEdit={canEdit}
              onEdit={() => setDlg({ kind: 'edit', goal: g })}
              onMove={(take) => setDlg({ kind: 'move', goal: g, take })}
            />
          ))}
        </ul>
      )}
      <GoalDialog open={dlg?.kind === 'new' || dlg?.kind === 'edit'} onClose={close} goal={dlg?.kind === 'edit' ? dlg.goal : undefined} />
      {dlg?.kind === 'move' && <GoalMoveDialog open onClose={close} goal={dlg.goal} take={dlg.take} />}
    </Card>
  )
}

function GoalItem({
  data, goal, today, canEdit, onEdit, onMove,
}: {
  data: AppData
  goal: Goal
  today: string
  canEdit: boolean
  onEdit: () => void
  onMove: (take: boolean) => void
}) {
  const { money, date } = useAppData()
  const gi = goalInfo(data, goal, today)
  return (
    <li className={cn('rounded-md border border-border p-3', gi.done && 'border-accent/60')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{goal.name}</p>
          <p className="mt-0.5 text-xs text-fg-subtle">{goalSub(goal, gi, { money, date })}</p>
        </div>
        <span className="num shrink-0 text-sm font-semibold">{Math.floor(gi.pct)}%</span>
      </div>
      <p className="num mt-2 text-xs text-fg-muted">
        <b className="text-fg">{money(gi.saved)}</b> de {money(goal.target)}
      </p>
      <div
        role="progressbar"
        aria-label={`Progresso de ${goal.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(gi.pct)}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${gi.pct}%` }} />
      </div>
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {!gi.walletName && (
            <>
              <Button size="sm" onClick={() => onMove(false)}>
                <Plus aria-hidden="true" />
                Guardar
              </Button>
              <Button size="sm" variant="ghost" disabled={gi.saved < 0.005} onClick={() => onMove(true)}>
                <Minus aria-hidden="true" />
                Retirar
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" className="ml-auto size-8" aria-label={`Editar meta ${goal.name}`} title="Editar" onClick={onEdit}>
            <Pencil />
          </Button>
        </div>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- recorrentes

function RecurringCard({ data }: { data: AppData }) {
  const { money, canEdit, canCreate } = useAppData()
  const list = sortedRecurring(data.recurring ?? [])
  const [dlg, setDlg] = useState<{ kind: 'new' } | { kind: 'edit'; rec: Recurring } | null>(null)
  const walletName = (id: string) => data.wallets.find((w) => w.id === id)?.name ?? 'carteira excluída'
  return (
    <Card aria-label="Lançamentos recorrentes">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Repeat aria-hidden="true" className="size-4 text-fg-subtle" />
          Lançamentos recorrentes
        </CardTitle>
        {canCreate && canEdit && data.wallets.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'new' })}>
            <Plus aria-hidden="true" />
            Novo recorrente
          </Button>
        )}
      </CardHeader>
      {list.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-fg-muted">Assinaturas, mesada, transferência pra poupança… lançados sozinhos todo mês.</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {list.map((r) => {
            const isIn = r.type === 'entrada'
            const row = (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-medium">{r.note || r.category}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    todo dia {r.day} · {walletName(r.walletId)}
                    {r.note ? ` · ${r.category}` : ''}
                    {r.active === false ? ' · pausado' : ''}
                  </span>
                </span>
                <span className={cn('num text-sm', isIn ? 'text-pos' : 'text-fg')}>
                  {isIn ? '+' : '−'}
                  {money(r.amount)}
                </span>
              </>
            )
            return (
              <li key={r.id}>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setDlg({ kind: 'edit', rec: r })}
                    aria-label={`Editar recorrente ${r.note || r.category}`}
                    className="flex w-full cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-2"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-2.5">{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <RecurringDialog open={dlg !== null} onClose={() => setDlg(null)} rec={dlg?.kind === 'edit' ? dlg.rec : undefined} />
    </Card>
  )
}

