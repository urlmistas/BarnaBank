import type { Debt, ISODate } from '@/lib/types'
import { round2 } from './dates'
import { finalValue, installments, makeDebtCalc } from './debts'
import { waMoney, type Money } from './whatsapp'

// "Comprovante de Lançamento de Débito": mensagem de brincadeira para mandar ao amigo que pegou dinheiro emprestado.
// Os valores são os reais da dívida: o juros que existe é só dividido em taxas com nome engraçado, e o total bate.

export interface ComedyCtx {
  today: ISODate
  money: Money
  date: (iso: ISODate) => string
  pixKey?: string
  /** sorteio (0 a 1), injetável para testar */
  rand?: () => number
}

const MAX_PARCELAS = 12

const FINAIS = [
  '+ um brownie',
  '+ um açaí',
  '+ uma gratidão eterna',
  '+ um "valeu, parceiro"',
  '+ um lanche no fim de semana',
  '+ um café com bolo',
]

const ZERO = [
  'Juros: 0% (você é sortudo de ser meu amigo)',
  'Juros: 0% (promoção por tempo limitado)',
  'Juros: 0% (por enquanto)',
]

const SERASA = ['Evite a inclusão do seu nome no Serasa e na minha lista negra.']

const pick = <T,>(list: T[], rand: () => number): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))]

export function funnyReceipt(d: Debt, ctx: ComedyCtx): string {
  const rand = ctx.rand ?? Math.random
  const m = (v: number) => waMoney(ctx.money, v)
  const calc = makeDebtCalc(ctx.today)
  const sch = calc.schedule(d)
  const principal = round2(d.principal)
  const juros = round2(Math.max(0, finalValue(d) - principal))
  const pct = (v: number) => (principal > 0 ? Math.round((v / principal) * 100) : 0)

  const out: string[] = []
  out.push('🏦 *BARNA COBRANÇAS S.A.*')
  out.push('_Comprovante de Lançamento de Débito_')
  out.push('')
  out.push('📉 *Resumo da Operação:*')
  out.push('• Valor solicitado: *' + m(principal) + '*')
  if (juros > 0.005) {
    // reparte o juros real em três taxas; a última fica com o resto para a soma bater
    const a = round2(juros * 0.5)
    const b = round2(juros * 0.3)
    const c = round2(juros - a - b)
    out.push('• Taxa de IOFF (Imposto Sobre O Fazer Favores): ' + pct(a) + '% (' + m(a) + ')')
    out.push('• Taxa de amizade em risco: ' + pct(b) + '% (' + m(b) + ')')
    out.push('• Taxa de conveniência (eu tava com o dinheiro na mão): ' + pct(c) + '% (' + m(c) + ')')
  } else {
    out.push('• ' + pick(ZERO, rand))
  }
  const n = installments(d)
  out.push('• Plano: ' + n + 'x' + (juros > 0.005 ? ' com juros' : ' sem juros'))

  // Cobra só a parcela da vez: as atrasadas, se houver; senão a próxima a vencer. Nunca o saldo todo.
  const emAberto = sch.insts.filter((it) => it.open > 0.005)
  const atrasadas = emAberto.filter((it) => it.late)
  const parcelas = atrasadas.length ? atrasadas : emAberto.slice(0, 1)
  if (parcelas.length) {
    out.push('')
    out.push(atrasadas.length ? '📊 *Parcela em atraso:*' : '📊 *Próxima parcela:*')
    for (const it of parcelas.slice(0, MAX_PARCELAS)) {
      out.push('• Parcela ' + String(it.i + 1).padStart(2, '0') + ' (' + ctx.date(it.dueISO) + '): *' + m(it.open) + '*')
    }
    if (parcelas.length > MAX_PARCELAS) out.push('• ... e mais ' + (parcelas.length - MAX_PARCELAS) + ' parcelas')
  }

  const totalParcela = round2(parcelas.reduce((s, it) => s + it.open, 0))
  out.push('')
  out.push('⚠️ *VALOR A PAGAR: ' + m(totalParcela) + '* ' + pick(FINAIS, rand))
  out.push('')
  out.push('💡 ' + pick(SERASA, rand) + (ctx.pixKey ? ' Chave Pix: ' + ctx.pixKey : ''))
  return out.join('\n')
}
