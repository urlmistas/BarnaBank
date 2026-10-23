import { describe, expect, it, vi } from 'vitest'
import type { Debt } from '@/lib/types'
import { makeDebtCalc, paidAmount } from '@/lib/finance/debts'
import {
  canIssueReceipt, lastPaymentDate, rankingHtml, rankingRows, receiptCode, receiptHtml, reportHtml, statementHtml, type DocCtx,
} from './documents'
import { esc, openPrintWindow, renderDoc } from './html'

const TODAY = '2026-03-15'
const money = (v: number) => 'R$ ' + v.toFixed(2).replace('.', ',')
const ctx: DocCtx = {
  today: TODAY, money, date: (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4),
  wallets: [{ id: 'w1', name: 'Nubank <b>' }], ownerName: 'Eu <script>', ownerCity: 'Santos', issuedAt: new Date(2026, 2, 15, 10, 30),
}
const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Ana <img src=x onerror=alert(1)>', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto', installments: 3, days: 90,
  date: '2026-01-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: 'nota <i>x</i>', ...over,
})
const paidDebt = () =>
  debt({ payments: [{ date: '2026-02-10', amount: 100, mode: 'fifo', walletId: 'w1' }, { date: '2026-03-01', amount: 200, mode: 'fifo', note: 'resto <b>' }] })

describe('html', () => {
  it('esc troca os cinco caracteres', () => expect(esc(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;'))
  it('renderDoc leva o botão de imprimir só na tela', () => {
    const h = renderDoc({ title: 'T <x>', css: '.a{}', body: '<p>oi</p>' })
    expect(h).toContain('<title>T &lt;x&gt;</title>')
    expect(h).toContain('class="no-print"')
    expect(h).toContain('@media print{.no-print{display:none}')
  })
  it('openPrintWindow escreve na janela e avisa se foi bloqueada', () => {
    const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn() }
    expect(openPrintWindow('<p/>', (() => ({ document: doc })) as never)).toBe(true)
    expect(doc.write).toHaveBeenCalledWith('<p/>')
    expect(openPrintWindow('<p/>', (() => null) as never)).toBe(false)
  })
})

describe('recibo', () => {
  it('só dívida a receber já quitada', () => {
    expect(canIssueReceipt(paidDebt(), TODAY)).toBe(true)
    expect(canIssueReceipt(debt(), TODAY)).toBe(false)
    expect(canIssueReceipt({ ...paidDebt(), kind: 'payable' }, TODAY)).toBe(false)
  })

  it('traz valor, extenso, data e pagamentos que batem com o motor', () => {
    const d = paidDebt()
    const h = receiptHtml(d, ctx)
    expect(paidAmount(d)).toBe(300)
    expect(h).toContain('R$ 300,00')
    expect(h).toContain('trezentos reais')
    expect(h).toContain('01/03/2026')
    expect(h).toContain('Santos, 1 de março de 2026.')
    expect(h).toContain('em 3 parcelas')
    expect(h).toContain(receiptCode(d))
    expect(lastPaymentDate(d, TODAY)).toBe('2026-03-01')
  })

  it('escapa tudo que veio do usuário', () => {
    const h = receiptHtml(paidDebt(), ctx)
    expect(h).not.toContain('<script>')
    expect(h).not.toContain('<img src=x')
    expect(h).toContain('Eu &lt;script&gt;')
    expect(h).toContain('Nubank &lt;b&gt;')
  })

  it('desconto e grupo aparecem', () => {
    const d = { ...paidDebt(), discount: 40 }
    const h = receiptHtml(d, ctx, 'Churrasco "do ano"')
    expect(h).toContain('Desconto concedido na quitação: R$ 40,00')
    expect(h).toContain('sua parte em &quot;Churrasco &quot;do ano&quot;&quot;')
  })

  it('o código muda quando um pagamento muda', () => {
    const a = paidDebt()
    const b = { ...a, payments: [...a.payments.slice(0, 1), { ...a.payments[1], amount: 201 }] }
    expect(receiptCode(a)).toMatch(/^BB-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(receiptCode(a)).not.toBe(receiptCode(b))
  })
})

describe('extrato', () => {
  it('dívida em aberto lista pagamentos e parcelas abertas, com os números do motor', () => {
    const d = debt({ payments: [{ date: '2026-02-10', amount: 100, mode: 'fifo' }] })
    const calc = makeDebtCalc(TODAY)
    const h = statementHtml(d, ctx)
    expect(h).toContain('Extrato de Empréstimo')
    expect(h).toContain(`R$ ${calc.remaining(d).toFixed(2).replace('.', ',')}`)
    expect(h).toContain('Em atraso')
    expect(h).toContain('A vencer')
    expect(h).toContain('Recebido')
    expect(h).not.toContain('<img src=x')
    expect(h).toContain('nota &lt;i&gt;x&lt;/i&gt;')
  })

  it('dívida a pagar usa os rótulos de dívida e não mostra juros nem lucro', () => {
    const h = statementHtml(debt({ kind: 'payable' }), ctx)
    expect(h).toContain('Extrato de Dívida')
    expect(h).toContain('Falta pagar')
    expect(h).not.toContain('Lucro estimado')
    expect(h).not.toContain('Juros ao mês')
  })

  it('sem pagamentos e quitada não quebra', () => {
    expect(statementHtml(debt(), ctx)).toContain('Nenhum pagamento registrado ainda.')
    expect(statementHtml(paidDebt(), ctx)).not.toContain('A vencer')
  })
})

describe('ranking', () => {
  it('soma por pessoa, ignora dívidas a pagar e ordena por recebido', () => {
    const rows = rankingRows(
      [
        debt({ id: 'a', name: 'Ana', payments: [{ date: '2026-02-10', amount: 50, mode: 'fifo' }] }),
        debt({ id: 'b', name: ' ana ', payments: [{ date: '2026-02-11', amount: 25, mode: 'fifo' }] }),
        debt({ id: 'c', name: 'Beto', payments: [{ date: '2026-02-11', amount: 200, mode: 'fifo' }] }),
        debt({ id: 'd', name: 'Caio', kind: 'payable', payments: [{ date: '2026-02-11', amount: 999, mode: 'fifo' }] }),
      ],
      TODAY,
    )
    expect(rows.map((r) => [r.name, r.loans, r.received])).toEqual([['Beto', 1, 200], ['Ana', 2, 75]])
    expect(rows.map((r) => r.late)).toEqual([0, 2])
  })

  it('gera o pódio e o total, com nomes escapados', () => {
    const h = rankingHtml([{ name: '<b>Zé</b>', loans: 1, received: 90, late: 0 }, { name: 'Ana', loans: 2, received: 10, late: 1 }], ctx)
    expect(h).toContain('Lenda Suprema')
    expect(h).toContain('&lt;b&gt;Zé&lt;/b&gt;')
    expect(h).toContain('R$ 100,00')
    expect(h).toContain('1 atrasado')
  })
})

describe('relatório', () => {
  it('monta a tabela da aba atual', () => {
    const h = reportHtml(
      { periodText: 'março de 2026', chartTitle: 'Fluxo <mensal>', summary: { income: 10, spending: 4, net: 6 }, head: ['Mês', 'Entradas'], rows: [{ label: 'março', cells: [10] }, { label: 'fev', cells: [3], muted: true }] },
      ctx,
    )
    expect(h).toContain('março de 2026')
    expect(h).toContain('Fluxo &lt;mensal&gt;')
    expect(h).toContain('R$ 6,00')
    expect(h).toContain('<th class="num">Entradas</th>')
    expect(h).toContain('color:#9a8f6a')
  })
})
