import type { Debt, ISODate, Wallet } from '@/lib/types'
import { EPS, round2 } from '@/lib/finance/dates'
import { finalValue, installments, makeDebtCalc, paidAmount } from '@/lib/finance/debts'
import { initials, nameKey } from '@/lib/finance/people'
import { dataCompleta, dataExtenso, extenso } from './extenso'
import { esc, renderDoc } from './html'

// Os quatro documentos imprimíveis: extrato da dívida (~l.3655), recibo de quitação (~l.8009), ranking (~l.3760)
// e relatório do período. Funções puras: recebem tudo pronto e devolvem HTML.

export interface DocCtx {
  today: ISODate
  money: (v: number) => string
  date: (iso: ISODate) => string
  wallets: Wallet[]
  ownerName: string
  ownerCity: string
  /** momento da emissão (injetável para teste) */
  issuedAt: Date
  /** tema do site na hora de gerar; o documento sai igual e dá para trocar no botão da página */
  theme?: 'dark' | 'light'
}

const stamp = (d: Date) => d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const pct = (n: number) => String(n).replace('.', ',')
const typeLabel = (t: string) => (t === 'simples' ? 'simples' : t === 'price' ? 'Tabela Price' : 'composto')

// ---------------------------------------------------------------- estilo comum das folhas claras

const SHEET_CSS = `
.sheet{max-width:680px;margin:0 auto;background:var(--p-surface);border:1px solid var(--p-border);border-radius:14px;padding:48px 52px 36px}
.s-top{display:flex;justify-content:space-between;align-items:center}
.s-brand{display:flex;align-items:center;gap:10px}
.s-mark{width:32px;height:32px;border-radius:8px;background:#d4b46a;display:flex;align-items:center;justify-content:center;font-family:"Geist","Inter",sans-serif;font-weight:600;color:#1a1608;font-size:18px}
.s-brandname{font-family:"Geist","Inter",sans-serif;font-weight:600;font-size:17px;letter-spacing:-.02em}
.s-doctype{text-align:right;color:var(--p-accent-text);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
.s-rule{height:1px;background:var(--p-border);margin:22px 0 28px}
.s-title{font-family:"Geist","Inter",sans-serif;font-weight:600;font-size:28px;line-height:34px;letter-spacing:-.03em;margin:0 0 4px}
.s-sub{font-size:14px;color:var(--p-muted);margin-bottom:28px}
.s-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:28px}
.s-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--p-subtle);margin-bottom:5px;font-weight:600}
.s-val{font-family:"Geist","Inter",sans-serif;font-variant-numeric:tabular-nums;font-size:18px;font-weight:600;letter-spacing:-.02em;color:var(--p-fg)}
.s-val.accent{color:var(--p-accent-text)}
.s-summary{background:var(--p-surface2);border:1px solid var(--p-border);border-radius:10px;padding:16px 20px;margin-bottom:28px;display:grid;grid-template-columns:1fr 1fr;gap:4px 28px}
.s-summary .row{display:flex;justify-content:space-between;gap:12px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--p-border);color:var(--p-muted)}
.s-summary .row b{font-family:"Geist","Inter",sans-serif;font-variant-numeric:tabular-nums;color:var(--p-fg);font-weight:600}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
thead th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--p-subtle);font-weight:600;padding:0 0 8px;border-bottom:1px solid var(--p-border-strong)}
tbody td{padding:10px 0;border-bottom:1px solid var(--p-border);font-size:13px}
tbody tr:last-child td{border-bottom:0}
td+td,th+th{padding-left:14px}
td.num,th.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.num{font-family:"Geist","Inter",sans-serif;font-weight:500}
.pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px}
.pill-paid{background:var(--p-pos-bg);color:var(--p-pos)}
.pill-pending{background:var(--p-warn-bg);color:var(--p-accent-text)}
.s-notes{margin-bottom:24px}
.s-notes p{font-size:14px;line-height:1.5;color:var(--p-fg);margin:4px 0 0;white-space:pre-wrap}
.s-footer{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-top:32px;padding-top:16px;border-top:1px solid var(--p-border)}
.s-footer .issued{font-size:11px;color:var(--p-subtle)}
.s-seal{width:44px;height:44px;flex:none;border-radius:10px;border:1px solid #d4b46a;display:flex;align-items:center;justify-content:center;font-family:"Geist","Inter",sans-serif;font-size:11px;font-weight:600;letter-spacing:.06em;color:var(--p-accent-text);text-align:center;line-height:1.2}
tr,.s-summary,.s-grid{break-inside:avoid}
@media print{.sheet{background:transparent;border:0;border-radius:0;margin:0;max-width:none;padding:6px 4px 0}}
`

const top = (docType: string) =>
  `<div class="s-top"><div class="s-brand"><div class="s-mark">B</div><div class="s-brandname">BarnaBank</div></div><div class="s-doctype">${esc(docType)}</div></div><div class="s-rule"></div>`

const footer = (ctx: DocCtx, extra = '') =>
  `<div class="s-footer"><div class="issued">Documento gerado por BarnaBank em ${esc(stamp(ctx.issuedAt))}${extra}<br>Caráter informativo, uso pessoal entre as partes.</div><div class="s-seal">BB</div></div>`

// ---------------------------------------------------------------- extrato da dívida

export function statementHtml(d: Debt, ctx: DocCtx): string {
  const calc = makeDebtCalc(ctx.today)
  const pay = d.kind === 'payable'
  const n = installments(d)
  const paid = calc.isPaid(d)
  const pays = [...d.payments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  let rows = pays.length
    ? pays
        .map(
          (p, i) =>
            `<tr><td>${i + 1}</td><td>${esc(ctx.date(p.date))}${p.note ? ' — ' + esc(p.note) : ''}</td><td class="num">${esc(ctx.money(p.amount))}</td>` +
            `<td><span class="pill pill-paid">${pay ? 'Pago' : 'Recebido'}</span></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="4" style="color:var(--p-subtle);font-style:italic">Nenhum pagamento registrado ainda.</td></tr>'
  if (!paid) {
    for (const it of calc.schedule(d).insts) {
      if (it.open <= 0) continue
      rows +=
        `<tr><td>${it.i + 1}/${n}</td><td>Parcela venc. ${esc(ctx.date(it.dueISO))}${it.pen > 0.005 ? ` (inclui ${esc(ctx.money(it.pen))} de encargos)` : ''}</td>` +
        `<td class="num">${esc(ctx.money(it.open))}</td><td><span class="pill pill-pending">${it.late ? 'Em atraso' : it.touched ? 'Parcial' : 'A vencer'}</span></td></tr>`
    }
  }
  const profit = calc.effectiveTotal(d) - d.principal
  const body =
    `<div class="sheet">${top(pay ? 'Extrato de Dívida' : 'Extrato de Empréstimo')}` +
    `<div class="s-title">${esc(d.name)}</div>` +
    `<div class="s-sub">${pay ? 'Referente à dívida contraída em ' : 'Referente ao empréstimo concedido em '}${esc(ctx.date(d.date))}</div>` +
    `<div class="s-grid"><div><div class="s-label">Valor original</div><div class="s-val">${esc(ctx.money(d.principal))}</div></div>` +
    (pay ? '' : `<div><div class="s-label">Juros ao mês</div><div class="s-val accent">${esc(pct(d.rate || 0))}% (${esc(typeLabel(d.interestType))})</div></div>`) +
    `<div><div class="s-label">Parcelas</div><div class="s-val">${n}x</div></div></div>` +
    `<div class="s-summary">` +
    `<div class="row"><span>${pay ? 'Valor total da dívida' : 'Valor total a receber'}</span><b>${esc(ctx.money(finalValue(d)))}</b></div>` +
    (pay ? '' : `<div class="row"><span>Lucro estimado</span><b>${esc(ctx.money(profit))}</b></div>`) +
    `<div class="row"><span>${pay ? 'Já pago' : 'Já recebido'}</span><b>${esc(ctx.money(paidAmount(d)))}</b></div>` +
    `<div class="row"><span>${pay ? 'Falta pagar' : 'Falta receber'}</span><b>${esc(ctx.money(calc.remaining(d)))}</b></div>` +
    (d.discount > 0.005 ? `<div class="row"><span>Desconto concedido</span><b>${esc(ctx.money(d.discount))}</b></div>` : '') +
    `</div>` +
    `<table><thead><tr><th>Parcela</th><th>Data / nota</th><th class="num">Valor</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` +
    (d.notes ? `<div class="s-notes"><div class="s-label">Anotações</div><p>${esc(d.notes)}</p></div>` : '') +
    footer(ctx) +
    `</div>`
  return renderDoc({ title: `Extrato — ${d.name} — BarnaBank`, css: SHEET_CSS, body, theme: ctx.theme })
}

// ---------------------------------------------------------------- recibo de quitação

/** hash curto e estável (hashStr ~l.7040) */
function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** código do recibo: muda se algum pagamento mudar */
export function receiptCode(d: Debt): string {
  const x = d.id + '|' + JSON.stringify(d.payments || [])
  const h = (hashStr(x) + hashStr(x + '#')).toUpperCase()
  return 'BB-' + h.slice(0, 4) + '-' + h.slice(4, 8)
}

/** data do último pagamento (ou hoje, se não houver) */
export function lastPaymentDate(d: Debt, today: ISODate): ISODate {
  return d.payments.reduce<ISODate>((m, p) => (p.date > m ? p.date : m), '') || today
}

/** recibo só existe para dívida a receber já quitada */
export function canIssueReceipt(d: Debt, today: ISODate): boolean {
  return d.kind === 'receivable' && makeDebtCalc(today).isPaid(d) && d.payments.length > 0
}

const RECEIPT_CSS = `
.sheet{padding:0 0 28px;overflow:hidden}
.r-bar{display:flex;justify-content:space-between;align-items:center;background:#0d0e10;color:#d4b46a;padding:12px 52px;font-family:"Geist","Inter",sans-serif;font-size:13px;font-weight:600;letter-spacing:-.01em;border-bottom:3px solid #d4b46a}
.r-bar span{color:#a1a3aa;font-weight:500;font-size:11px;font-variant-numeric:tabular-nums;letter-spacing:.04em}
.r-in{padding:36px 52px 0}
.r-h{font-size:24px;font-weight:600;margin:0;letter-spacing:.01em}
.r-sm{color:var(--p-muted);font-size:13px;margin:6px 0 28px}
.r-total{background:var(--p-surface2);border-left:3px solid #d4b46a;border-radius:0 10px 10px 0;padding:16px 18px;display:flex;justify-content:space-between;gap:16px;margin-bottom:28px}
.r-total .k{font-size:11px;font-weight:600;color:var(--p-subtle);letter-spacing:.08em}
.r-total .v{font-family:"Geist","Inter",sans-serif;font-variant-numeric:tabular-nums;font-size:22px;font-weight:600;letter-spacing:-.02em;margin-top:4px}
.r-total .v2{font-family:"Geist","Inter",sans-serif;font-size:15px;font-weight:600;margin-top:4px;text-align:right}
.r-text{font-size:14px;line-height:1.65;margin:0 0 14px}
.r-note{font-size:12px;color:var(--p-muted);margin:0 0 14px}
.r-h2{font-size:11px;font-weight:600;color:var(--p-subtle);letter-spacing:.08em;margin:22px 0 6px;padding-bottom:6px;border-bottom:1px solid var(--p-border-strong)}
.r-tbl td{padding:8px 10px;font-size:13px}
.r-tbl tr:nth-child(odd) td{background:var(--p-bg)}
.r-tbl td.w{color:var(--p-muted);font-size:12px}
.r-sum td{font-weight:600;border-top:1px solid var(--p-border-strong)}
.r-place{margin:40px 0 0;font-size:13px}
.r-sign{margin-top:56px;width:250px;border-top:1px solid var(--p-fg);padding-top:6px;font-size:13px}
.r-foot{margin:36px 52px 0;font-size:11px;color:var(--p-subtle)}
`

export function receiptHtml(d: Debt, ctx: DocCtx, groupTitle?: string): string {
  const total = round2(paidAmount(d))
  const last = lastPaymentDate(d, ctx.today)
  const n = installments(d)
  const owner = ctx.ownerName.trim()
  const city = ctx.ownerCity.trim()
  const pays = [...d.payments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const ref = groupTitle
    ? `referente à sua parte em "${groupTitle}" (${dataCompleta(d.date)})`
    : `referente ao empréstimo feito em ${dataCompleta(d.date)}${n > 1 ? `, em ${n} parcelas` : ''}`
  const para =
    `${owner ? `Eu, ${esc(owner)}, declaro` : 'Declaro'} que recebi de <b>${esc(d.name)}</b> a importância de <b>${esc(ctx.money(total))}</b> (${esc(extenso(total))}), ` +
    `${esc(ref)}, e dou plena e total quitação desta dívida, nada mais tendo a receber a esse título.`
  const shown = pays.slice(0, 24)
  const rows = shown
    .map((p) => {
      const w = p.walletId ? ctx.wallets.find((x) => x.id === p.walletId) : undefined
      return `<tr><td>${esc(dataCompleta(p.date))}</td><td class="w">${esc(w?.name ?? '')}</td><td class="num"><b>${esc(ctx.money(p.amount))}</b></td></tr>`
    })
    .join('')
  const more = pays.length > shown.length ? `<tr><td colspan="3" class="w">+ ${pays.length - shown.length} pagamentos</td></tr>` : ''
  const code = receiptCode(d)
  const body =
    `<div class="sheet"><div class="r-bar">BarnaBank<span>${esc(code)}</span></div><div class="r-in">` +
    `<h1 class="r-h">RECIBO DE QUITAÇÃO</h1><p class="r-sm">Comprovante de que a dívida foi paga por completo.</p>` +
    `<div class="r-total"><div><div class="k">VALOR TOTAL RECEBIDO</div><div class="v">${esc(ctx.money(total))}</div></div>` +
    `<div><div class="k" style="text-align:right">QUITADO EM</div><div class="v2">${esc(dataCompleta(last))}</div></div></div>` +
    `<p class="r-text">${para}</p>` +
    (d.discount > EPS ? `<p class="r-note">Desconto concedido na quitação: ${esc(ctx.money(d.discount))}.</p>` : '') +
    `<div class="r-h2">PAGAMENTOS</div><table class="r-tbl"><tbody>${rows}${more}` +
    `<tr class="r-sum"><td colspan="2">Total</td><td class="num">${esc(ctx.money(total))}</td></tr></tbody></table>` +
    `<p class="r-place">${city ? esc(city) + ', ' : ''}${esc(dataExtenso(last))}.</p>` +
    `<div class="r-sign">${owner ? `<b>${esc(owner)}</b>` : '<span style="color:var(--p-subtle)">Assinatura de quem recebeu</span>'}</div></div>` +
    `<p class="r-foot">Gerado pelo BarnaBank em ${esc(dataCompleta(ctx.today))} · código ${esc(code)}. Valores conforme os pagamentos registrados.</p></div>`
  return renderDoc({ title: `Recibo de quitação — ${d.name} — BarnaBank`, css: SHEET_CSS + RECEIPT_CSS, body, theme: ctx.theme })
}

// ---------------------------------------------------------------- ranking dos pagadores

export interface RankingRow {
  name: string
  loans: number
  received: number
  late: number
}

/** quem mais pagou, entre as dívidas a receber (openRanking ~l.3760) */
export function rankingRows(debts: Debt[], today: ISODate): RankingRow[] {
  const calc = makeDebtCalc(today)
  const by = new Map<string, RankingRow>()
  for (const d of debts) {
    if (d.kind !== 'receivable') continue
    const k = nameKey(d.name)
    const g = by.get(k) ?? { name: d.name, loans: 0, received: 0, late: 0 }
    g.loans++
    g.received += paidAmount(d)
    if (calc.statusOf(d) === 'atrasado') g.late++
    by.set(k, g)
  }
  return [...by.values()].sort((a, b) => b.received - a.received)
}

const TITLES = ['Lenda Suprema', 'Herói de Ouro', 'Guardião Brilhante']

const RANK_CSS = `
html,body{background:#0d0e10}
body{color:#ededef;padding:32px 16px}
.no-print{max-width:720px}
.no-print button{background:#d4b46a;color:#1a1608}
.sheet{max-width:720px;margin:0 auto}
.r-top{text-align:center;margin-bottom:8px}
.r-eyebrow{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#d4b46a;font-weight:600}
.r-title{font-family:"Geist","Inter",sans-serif;font-size:40px;line-height:44px;font-weight:600;letter-spacing:-.035em;margin:8px 0 4px;color:#ededef}
.r-sub{color:#a1a3aa;font-size:13px;margin-bottom:28px}
.podium{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:28px;align-items:end}
.pc{background:#131417;border:1px solid #25272c;border-radius:14px;padding:18px 10px;text-align:center}
.pc.rank-1{padding-top:28px;padding-bottom:28px;border-color:#d4b46a}
.pc-pos{font-family:"Geist","Inter",sans-serif;font-size:12px;color:#d4b46a;font-weight:600}
.pc-avatar{width:52px;height:52px;border-radius:50%;margin:8px auto 10px;display:flex;align-items:center;justify-content:center;font-family:"Geist","Inter",sans-serif;font-weight:600;font-size:18px;color:#1a1608;background:#d4b46a}
.pc-name{font-family:"Geist","Inter",sans-serif;font-weight:600;font-size:16px;letter-spacing:-.01em}
.pc-title{font-size:11px;color:#d4b46a;text-transform:uppercase;letter-spacing:.08em;margin:3px 0 10px;font-weight:600}
.pc-val{font-family:"Geist","Inter",sans-serif;font-variant-numeric:tabular-nums;font-weight:600;font-size:20px;letter-spacing:-.02em;color:#ededef}
.pc-sub{font-size:11px;color:#80838b;margin-top:3px}
.rank-list{background:#131417;border:1px solid #25272c;border-radius:14px;padding:8px;margin-bottom:22px}
.rank-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;break-inside:avoid}
.rank-row:nth-child(even){background:#191a1e}
.rr-pos{font-family:"Geist","Inter",sans-serif;font-weight:600;color:#80838b;width:28px;font-size:13px}
.rr-avatar{width:34px;height:34px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-family:"Geist","Inter",sans-serif;font-weight:600;font-size:12px;color:#ededef;background:#34363c}
.rr-name{flex:1;font-weight:600;font-size:14px}
.rr-sub{display:block;font-weight:400;font-size:11px;color:#80838b;margin-top:2px}
.rr-val{font-family:"Geist","Inter",sans-serif;font-variant-numeric:tabular-nums;font-weight:600;font-size:14px;color:#ededef}
.fs{text-align:center;margin-bottom:24px}
.fs-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#a1a3aa;margin-bottom:6px;font-weight:600}
.fs-val{font-family:"Geist","Inter",sans-serif;font-variant-numeric:tabular-nums;font-size:28px;font-weight:600;letter-spacing:-.03em;color:#d4b46a}
.r-footer{text-align:center;font-size:11px;color:#80838b;padding-top:14px;border-top:1px solid #25272c}
@page{margin:0}
@media print{body{background:#0d0e10;padding:14mm 12mm}}
@media (max-width:560px){.podium{grid-template-columns:1fr}}
`

export function rankingHtml(rows: RankingRow[], ctx: DocCtx): string {
  const loans = (n: number) => `${n} ${n === 1 ? 'empréstimo' : 'empréstimos'}`
  const podium = rows
    .slice(0, 3)
    .map(
      (p, i) =>
        `<div class="pc rank-${i + 1}"><div class="pc-pos">#${i + 1}</div><div class="pc-avatar">${esc(initials(p.name))}</div>` +
        `<div class="pc-name">${esc(p.name)}</div><div class="pc-title">${TITLES[i]}</div><div class="pc-val">${esc(ctx.money(p.received))}</div>` +
        `<div class="pc-sub">${loans(p.loans)}${p.late ? ` · ${p.late} atrasado${p.late > 1 ? 's' : ''}` : ''}</div></div>`,
    )
    .join('')
  const rest = rows
    .slice(3)
    .map(
      (p, i) =>
        `<div class="rank-row"><div class="rr-pos">#${i + 4}</div><div class="rr-avatar">${esc(initials(p.name))}</div>` +
        `<div class="rr-name">${esc(p.name)}<span class="rr-sub">${loans(p.loans)}${p.late ? ` · ${p.late} atrasado${p.late > 1 ? 's' : ''}` : ''}</span></div>` +
        `<div class="rr-val">${esc(ctx.money(p.received))}</div></div>`,
    )
    .join('')
  const total = rows.reduce((s, p) => s + p.received, 0)
  const body =
    `<div class="sheet"><div class="r-top"><div class="r-eyebrow">BarnaBank apresenta</div><div class="r-title">Ranking dos Pagadores</div>` +
    `<div class="r-sub">Gerado em ${esc(ctx.issuedAt.toLocaleDateString('pt-BR'))} · quem mais honrou seus compromissos até agora</div></div>` +
    `<div class="podium">${podium}</div>${rest ? `<div class="rank-list">${rest}</div>` : ''}` +
    `<div class="fs"><div class="fs-label">Total já recebido por todos</div><div class="fs-val">${esc(ctx.money(total))}</div></div>` +
    `<div class="r-footer">Documento gerado por BarnaBank · uso pessoal e divertido entre amigos</div></div>`
  return renderDoc({ title: 'Ranking — BarnaBank', css: RANK_CSS, body, theme: 'dark', themable: false })
}

// ---------------------------------------------------------------- relatório do período

export interface ReportDoc {
  periodText: string
  chartTitle: string
  summary: { income: number; spending: number; net: number }
  head: string[]
  rows: { label: string; cells: number[]; muted?: boolean }[]
}

export function reportHtml(r: ReportDoc, ctx: DocCtx): string {
  const th = r.head.map((h, i) => `<th${i ? ' class="num"' : ''}>${esc(h)}</th>`).join('')
  const rows = r.rows
    .map(
      (x) =>
        `<tr${x.muted ? ' style="color:var(--p-subtle)"' : ''}><td>${esc(x.label)}</td>${x.cells.map((v) => `<td class="num">${esc(ctx.money(v))}</td>`).join('')}</tr>`,
    )
    .join('')
  const body =
    `<div class="sheet">${top('Relatório')}<div class="s-title">${esc(r.periodText)}</div><div class="s-sub">${esc(r.chartTitle)}</div>` +
    `<div class="s-grid"><div><div class="s-label">Entradas</div><div class="s-val">${esc(ctx.money(r.summary.income))}</div></div>` +
    `<div><div class="s-label">Gastos</div><div class="s-val">${esc(ctx.money(r.summary.spending))}</div></div>` +
    `<div><div class="s-label">Saldo do período</div><div class="s-val accent">${esc(ctx.money(r.summary.net))}</div></div></div>` +
    `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>${footer(ctx)}</div>`
  return renderDoc({ title: `Relatório — ${r.periodText} — BarnaBank`, css: SHEET_CSS, body, theme: ctx.theme })
}
