import type { Debt } from '@/lib/types'
import { nameKey } from '@/lib/finance/people'
import { makeDebtCalc } from '@/lib/finance/debts'
import { whatsappLink, whatsappMessage, type ChargeCtx } from '@/lib/finance/whatsapp'
import { shareLinkFor } from '@/lib/shares/shares'
import { STORAGE_KEY } from '@/lib/storage'
import { readBotCfg } from '@/lib/sync/worker'

/**
 * Link de cobrança já criado para esta dívida (ou, na falta, para a pessoa), para ir no rodapé da mensagem de
 * WhatsApp. Devolve '' se não há link ou o bot não está ligado. Só lê: criar o link é com o diálogo de links.
 */
export function chargeLinkFor(debt: Debt): string {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '{}') as { shares?: unknown }
    const url = readBotCfg().url
    return shareLinkFor(raw.shares, url, 'debt', debt.id) || shareLinkFor(raw.shares, url, 'person', nameKey(debt.name))
  } catch {
    return ''
  }
}

/** a dívida atrasada que me devem (a mais antiga primeiro) */
function lateDebtOf(debts: Debt[], today: ChargeCtx['today']): Debt | undefined {
  const calc = makeDebtCalc(today)
  return debts
    .filter((d) => d.kind !== 'payable' && !calc.isPaid(d) && calc.statusOf(d) === 'atrasado')
    .sort((x, y) => (calc.nextDueDate(x)?.getTime() ?? 0) - (calc.nextDueDate(y)?.getTime() ?? 0))[0]
}

type LateCtx = Omit<ChargeCtx, 'groupTitle' | 'link'>

/** texto da cobrança da dívida atrasada que me devem (o mesmo do WhatsApp); null se a pessoa não tem dívida atrasada */
export function lateChargeText(debts: Debt[], ctx: LateCtx, groups: { id: string; title: string }[] = []): string | null {
  const late = lateDebtOf(debts, ctx.today)
  if (!late) return null
  return whatsappMessage(late, { ...ctx, groupTitle: groups.find((g) => g.id === late.groupId)?.title, link: chargeLinkFor(late) })
}

/**
 * Link de WhatsApp com a cobrança da dívida atrasada que me devem (a mais antiga primeiro).
 * null se a pessoa não tem dívida atrasada a receber ou não tem telefone cadastrado.
 */
export function lateChargeHref(
  debts: Debt[],
  contact: { phone?: unknown } | undefined | null,
  ctx: LateCtx,
  groups: { id: string; title: string }[] = [],
): string | null {
  const late = lateDebtOf(debts, ctx.today)
  if (!late) return null
  return whatsappLink(late, contact, { ...ctx, groupTitle: groups.find((g) => g.id === late.groupId)?.title, link: chargeLinkFor(late) })
}
