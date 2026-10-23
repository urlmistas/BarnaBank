import type { AppData, Debt, ISODate, Transaction } from '@/lib/types'
import { addDaysISO, dayIn, parseISO, ymAdd, ymOf } from '@/lib/finance/dates'
import { cardInvoices } from '@/lib/finance/bills-cards'

// Dados fictícios para revisar a interface quando não há nada no localStorage.
// Datas relativas a `today`, para sempre haver atrasados, vencimentos próximos etc.
// Nada disto é gravado.

function debt(p: Partial<Debt> & Pick<Debt, 'id' | 'name' | 'principal' | 'date'>): Debt {
  return {
    kind: 'receivable', rate: 0, interestType: 'composto', installments: 1, days: 30,
    dueDay: parseISO(p.date).getDate(), payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '',
    ...p,
  } as Debt
}

/**
 * Histórico para os Relatórios: de 3 a 12 meses atrás, salário e gastos do dia a dia; nos 2 meses
 * anteriores ao atual, só os gastos do dia a dia (salário, aluguel e academia já vêm de t0/t0c e das contas fixas).
 */
function history(ym: string): Transaction[] {
  const out: Transaction[] = []
  for (let i = 1; i <= 12; i++) {
    const k = ymAdd(ym, -i)
    const tx = (id: string, type: Transaction['type'], amount: number, day: number, category: string): Transaction => ({
      id: 'h' + i + '-' + id, walletId: 'w1', type, amount, date: dayIn(k, day), category,
    })
    out.push(
      tx('mer', 'gasto', 820 + ((i * 37) % 180) + 0.9, 9, 'Mercado'),
      tx('tra', 'gasto', 260 + ((i * 17) % 120), 14, 'Transporte'),
      tx('laz', 'gasto', 180 + ((i * 53) % 260) + 0.5, 20, 'Lazer'),
    )
    if (i <= 2) continue
    out.push(
      tx('sal', 'entrada', 6200, 5, 'Salário'),
      tx('alu', 'gasto', 1850, 6, 'Moradia'),
      tx('cas', 'gasto', 410 + ((i * 23) % 90) + 0.35, 11, 'Casa'),
      tx('sau', 'gasto', 99, 12, 'Saúde'),
      tx('inv', 'gasto', i % 2 ? 1200 : 1800, 25, 'Investimentos'),
    )
    if (i % 3 === 0) out.push(tx('fre', 'entrada', 400, 18, 'Freela'))
  }
  return out
}

export function buildDemoData(today: ISODate): AppData {
  const d = (n: number) => addDaysISO(today, n)
  const ym = ymOf(today)
  const dayOfMonth = parseISO(today).getDate()
  const thisMonth = (day: number) => ym + '-' + String(Math.min(day, dayOfMonth)).padStart(2, '0')

  const data: AppData = {
    contacts: {},
    wallets: [
      { id: 'w1', name: 'Nubank', icon: 'landmark' },
      { id: 'w2', name: 'Inter', icon: 'credit-card' },
      { id: 'w3', name: 'Dinheiro', icon: 'banknote' },
    ],
    transactions: [
      ...history(ym),
      { id: 't0', walletId: 'w1', type: 'entrada', amount: 6200, date: d(-62), category: 'Salário' },
      { id: 't0b', walletId: 'w1', type: 'gasto', amount: 2380.4, date: d(-50), category: 'Investimentos' },
      { id: 't0c', walletId: 'w1', type: 'entrada', amount: 6200, date: d(-32), category: 'Salário' },
      { id: 't0d', walletId: 'w1', type: 'gasto', amount: 3150.9, date: d(-20), category: 'Investimentos' },
      { id: 't1', walletId: 'w1', type: 'entrada', amount: 6200, date: thisMonth(5), category: 'Salário', auto: 'bill:b5:' + ym },
      { id: 't2', walletId: 'w1', type: 'gasto', amount: 1850, date: thisMonth(6), category: 'Moradia', note: 'Aluguel', auto: 'bill:b3:' + ym },
      { id: 't3', walletId: 'w2', type: 'gasto', amount: 412.37, date: thisMonth(8), category: 'Mercado' },
      { id: 't4', walletId: 'w1', type: 'transferencia', toWalletId: 'w2', amount: 800, date: thisMonth(8), category: 'Transferência' },
      { id: 't5', walletId: 'w3', type: 'entrada', amount: 300, date: thisMonth(10), category: 'Freela' },
      { id: 't6', walletId: 'w2', type: 'gasto', amount: 129.9, date: thisMonth(12), category: 'Transporte' },
    ],
    groups: [{ id: 'g1', title: 'Churrasco do sábado', kind: 'receivable', total: 360 }],
    debts: [
      debt({ id: 'd1', name: 'Pedro Almeida', principal: 1500, date: d(-75), installments: 3, days: 90,
        payments: [{ id: 'p1', date: d(-44), amount: 500, walletId: 'w1' }] }),
      debt({ id: 'd2', name: 'Ana Souza', principal: 420, date: d(-28), firstDue: d(2) }),
      debt({ id: 'd3', name: 'Lucas Ferreira', principal: 120, date: d(-10), firstDue: d(5), groupId: 'g1' }),
      debt({ id: 'd4', name: 'Marina Costa', principal: 120, date: d(-10), firstDue: d(5), groupId: 'g1' }),
      debt({ id: 'd5', name: 'Rafael Lima', principal: 2000, rate: 2, date: d(-15), installments: 6, days: 180 }),
      debt({ id: 'd6', name: 'Carlos (oficina)', kind: 'payable', principal: 900, date: d(-20), firstDue: d(1), installments: 3, days: 90 }),
      debt({ id: 'd7', name: 'Júlia Ramos', principal: 250, date: d(-60), firstDue: d(-30),
        payments: [{ id: 'p2', date: d(-30), amount: 250, walletId: 'w3' }] }),
    ],
    bills: [
      { id: 'b1', name: 'Internet', amount: 119.9, kind: 'gasto', dueDay: parseISO(d(3)).getDate(), paid: { [ymAdd(ym, -1)]: 'x', [ymAdd(ym, -2)]: 'x' }, active: true, startMonth: ymAdd(ym, -2), category: 'Casa' },
      { id: 'b2', name: 'Academia', amount: 99, kind: 'gasto', dueDay: parseISO(d(6)).getDate(), paid: { [ymAdd(ym, -1)]: 'x', [ymAdd(ym, -2)]: 'x' }, active: true, startMonth: ymAdd(ym, -2), category: 'Saúde' },
      { id: 'b3', name: 'Aluguel', amount: 1850, kind: 'gasto', dueDay: 6, paid: { [ym]: 't2', [ymAdd(ym, -1)]: 'x', [ymAdd(ym, -2)]: 'x' }, active: true, startMonth: ymAdd(ym, -2), category: 'Moradia', walletId: 'w1' },
      { id: 'b4', name: 'Energia', amount: 187.45, kind: 'gasto', dueDay: parseISO(d(-4)).getDate(), paid: { [ymAdd(ym, -1)]: 'x' }, active: true, startMonth: ymAdd(ym, -1), category: 'Casa' },
      { id: 'b5', name: 'Salário', amount: 6200, kind: 'entrada', dueDay: 5, paid: { [ym]: 't1' }, active: true, startMonth: ym, walletId: 'w1' },
    ],
    cards: [{ id: 'c1', name: 'Nubank', closingDay: parseISO(d(-3)).getDate(), dueDay: parseISO(d(4)).getDate(), limit: 5000, walletId: 'w1' }],
    cardPurchases: [
      { id: 'cp1', cardId: 'c1', amount: 640, date: d(-25), installments: 1, category: 'Compras', desc: 'Supermercado do mês' },
      { id: 'cp2', cardId: 'c1', amount: 1200, date: d(-40), installments: 4, category: 'Eletrônicos', desc: 'Fone de ouvido' },
      { id: 'cp3', cardId: 'c1', amount: 89.9, date: d(-12), installments: 1, category: 'Lazer', desc: 'Cinema' },
    ],
    cardPayments: [],
  }
  // fatura do mês passado paga no vencimento (para o histórico do cartão ter "paga")
  const prevKey = ymAdd(ym, -1)
  const prev = cardInvoices(data, data.cards[0], today).get(prevKey)
  if ((prev.total ?? 0) > 0.005 && prev.due! <= today) {
    data.cardPayments.push({ id: 'cpay1', cardId: 'c1', amount: prev.total!, invoice: prevKey, date: prev.due })
  }
  return data
}
