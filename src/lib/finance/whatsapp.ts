import type { Debt, ISODate } from '@/lib/types'
import { toISO } from './dates'
import { installments, makeDebtCalc } from './debts'

// Cobrança pelo WhatsApp (app.js: whatsPhone ~l.667, whatsappMessage ~l.678, chargeFooter ~l.2475).

export type Money = (v: number) => string

const onlyDigits = (s: unknown) => String(s ?? '').replace(/\D/g, '')

/** primeiro nome sem o que vem entre parênteses ("Carlos (oficina)" → "Carlos") */
export function greetName(name: string): string {
  const first = String(name).replace(/\([^)]*\)/g, ' ').trim().split(/\s+/)[0]
  return first || name
}

/** "R$150,00" sem espaço, para mensagens de WhatsApp */
export const waMoney = (money: Money, v: number) => money(v).replace(/^(-?R\$)[\s ]+/, '$1')

/** telefone com DDI (assume Brasil se vier só com DDD); '' se não houver */
export function whatsPhone(contact: { phone?: unknown } | undefined | null): string {
  const phone = onlyDigits(contact?.phone)
  if (!phone) return ''
  return phone.length <= 11 ? '55' + phone : phone
}

export interface ChargeCtx {
  today: ISODate
  money: Money
  date: (iso: ISODate) => string
  /** chave Pix das Configurações */
  pixKey?: string
  /** link de cobrança público (o fork de links preenche); vazio = não coloca */
  link?: string
  /** título do grupo, quando a dívida é de uma conta dividida */
  groupTitle?: string
}

export function chargeFooter(pixKey?: string, link?: string): string {
  const out: string[] = []
  if (pixKey) out.push('*Pix:* ' + pixKey)
  if (link) out.push('*Detalhes:* ' + link)
  return out.length ? '\n\n' + out.join('\n') : ''
}

export function whatsappMessage(d: Debt, ctx: ChargeCtx): string {
  const calc = makeDebtCalc(ctx.today)
  const m = (v: number) => waMoney(ctx.money, v)
  const due = calc.nextDueDate(d)
  const dueTxt = due ? ctx.date(toISO(due)) : ''
  const st = calc.statusOf(d)
  const sch = calc.schedule(d)
  const hi = 'Oi ' + greetName(d.name) + ', tudo bem? '
  let msg: string
  if (ctx.groupTitle && installments(d) === 1) {
    msg =
      st === 'atrasado'
        ? hi + 'Sobre o *' + ctx.groupTitle + '*: sua parte de *' + m(calc.remaining(d)) + '* ficou em aberto (era até ' + dueTxt + '). Consegue acertar comigo? 🙂'
        : hi + 'Sobre o *' + ctx.groupTitle + '*: sua parte ficou *' + m(calc.remaining(d)) + '*' + (due ? ', pra pagar até ' + dueTxt : '') + '. Qualquer coisa me avisa 🙂'
  } else if (st === 'atrasado') {
    msg =
      hi + 'Passando pra lembrar que ' + (sch.overdueCount > 1 ? 'tem ' + sch.overdueCount + ' parcelas em aberto, somando ' : 'ficou em aberto ') +
      '*' + m(sch.overdue) + '* (vencimento em ' + dueTxt + '). Consegue acertar comigo? Pode ser uma parte também 🙂'
  } else if (st === 'hoje') {
    msg = hi + 'Só passando pra lembrar que sua parcela de *' + m(calc.amountDueNow(d)) + '* vence hoje. Consegue enviar? 🙂'
  } else {
    msg = hi + 'Sua próxima parcela é de *' + m(calc.amountDueNow(d)) + '*' + (due ? ', vencimento em ' + dueTxt : '') + '. Qualquer coisa me avisa 😉'
  }
  return msg + chargeFooter(ctx.pixKey, ctx.link)
}

/** link do wa.me, ou null se a pessoa não tem telefone cadastrado */
export function whatsappLink(d: Debt, contact: { phone?: unknown } | undefined | null, ctx: ChargeCtx): string | null {
  const phone = whatsPhone(contact)
  if (!phone) return null
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(whatsappMessage(d, ctx))
}
