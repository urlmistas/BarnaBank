import type { AppData, CardPurchase, ISODate, Transaction } from '@/lib/types'
import { round2 } from './dates'
import { normTxt } from './people'
import { newId } from './mutations'
import { STORAGE_KEY } from '@/lib/storage'
import type { StoreApi } from '@/lib/store'

// Importar extrato do banco (OFX / CSV). Portado do app antigo (app.js ~6930-7130).
// O arquivo é entrada NÃO confiável: tamanho, quantidade de linhas e tamanho de cada campo têm limite.

/** tamanho máximo do arquivo lido (5 MB) */
export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** linhas lidas do arquivo, no máximo */
export const MAX_ROWS = 20000
/** itens mostrados na prévia (os mais recentes) */
export const MAX_PREVIEW = 400

export interface StatementRow {
  date: ISODate
  /** negativo = saída */
  amount: number
  desc: string
  /** id do banco (FITID), quando existe */
  fid: string
}

export interface ParsedStatement {
  rows: StatementRow[]
  /** CSV de fatura de cartão: gastos vêm positivos */
  cardLike: boolean
}

const cut = (s: string, n: number) => s.slice(0, n)

/** utf-8; se aparecer o caractere de substituição, tenta windows-1252 (extratos de banco costumam vir assim) */
export function decodeText(buf: ArrayBuffer): string {
  let t = new TextDecoder('utf-8').decode(buf)
  if (t.includes('�')) {
    try {
      t = new TextDecoder('windows-1252').decode(buf)
    } catch {
      /* mantém utf-8 */
    }
  }
  return t.replace(/^﻿/, '')
}

const pad2 = (n: number) => (n < 10 ? '0' : '') + n

/** data válida (mês 1-12, dia 1-31) em AAAA-MM-DD, ou '' */
function isoOrEmpty(y: number, m: number, d: number): ISODate {
  if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return ''
  return `${y}-${pad2(m)}-${pad2(d)}`
}

export function parseDateAny(s: unknown): ISODate {
  const t = String(s ?? '').trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) return isoOrEmpty(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t)
  if (m) return isoOrEmpty(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return ''
}

/** "1.234,56", "-R$ 12,00", "(45,90)", "12,5-" → número (NaN se não der) */
export function parseAmt(raw: unknown): number {
  let s = String(raw ?? '').replace(/[R$\s ]/g, '')
  if (!s) return NaN
  const neg = /^-|^\(.*\)$|-$/.test(s)
  s = s.replace(/[()+-]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const v = parseFloat(s)
  return isNaN(v) || !isFinite(v) ? NaN : neg ? -v : v
}

export function parseOFX(text: string): StatementRow[] {
  const out: StatementRow[] = []
  const parts = text.split(/<STMTTRN>/i).slice(1)
  const tag = (b: string, n: string) => {
    const r = new RegExp('<' + n + '>([^<\\r\\n]*)', 'i').exec(b)
    return r ? r[1].trim() : ''
  }
  for (const part of parts) {
    if (out.length >= MAX_ROWS) break
    const b = part.split(/<\/STMTTRN>/i)[0]
    const dt = tag(b, 'DTPOSTED')
    const amt = parseFloat(tag(b, 'TRNAMT').replace(',', '.'))
    if (!/^\d{8}/.test(dt) || isNaN(amt) || !isFinite(amt)) continue
    const date = isoOrEmpty(+dt.slice(0, 4), +dt.slice(4, 6), +dt.slice(6, 8))
    if (!date) continue
    out.push({ date, amount: amt, desc: cut(tag(b, 'MEMO') || tag(b, 'NAME') || tag(b, 'TRNTYPE'), 200), fid: cut(tag(b, 'FITID'), 80) })
  }
  return out
}

/** divide uma linha de CSV respeitando aspas */
export function splitCSV(line: string, d: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') q = true
    else if (c === d) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  out.push(cur.trim())
  return out
}

export function parseCSVStatement(text: string): ParsedStatement | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  let hi = -1
  let delim = ','
  let cols: string[] = []
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const d = lines[i].split(';').length > lines[i].split(',').length ? ';' : ','
    const c = splitCSV(lines[i], d).map((x) => normTxt(x))
    if (c.some((x) => /^(data|date)/.test(x)) && c.some((x) => /^(valor|amount|quantia)/.test(x))) {
      hi = i
      delim = d
      cols = c
      break
    }
  }
  if (hi === -1) return null
  const iDate = cols.findIndex((x) => /^(data|date)/.test(x))
  const iVal = cols.findIndex((x) => /^(valor|amount|quantia)/.test(x))
  const iDesc: number[] = []
  cols.forEach((x, i) => {
    if (i !== iDate && /(descri|histor|title|memo|estabelec|lancamento$|detalhe)/.test(x)) iDesc.push(i)
  })
  const iId = cols.findIndex((x) => /^(identificador|id)$/.test(x))
  const cardLike = cols.includes('title') && cols.includes('amount')
  const rows: StatementRow[] = []
  for (const l of lines.slice(hi + 1, hi + 1 + MAX_ROWS)) {
    const c = splitCSV(l, delim)
    const date = parseDateAny(c[iDate])
    const amt = parseAmt(c[iVal])
    if (!date || isNaN(amt) || amt === 0) continue
    rows.push({
      date,
      amount: amt,
      desc: cut(iDesc.map((i) => c[i]).filter(Boolean).join(' · ') || 'Lançamento', 200),
      fid: iId !== -1 ? cut(c[iId] ?? '', 80) : '',
    })
  }
  return { rows, cardLike }
}

/** lê o arquivo (OFX ou CSV). null = formato não reconhecido; erro de tamanho vira exceção com mensagem pronta */
export function parseStatement(buf: ArrayBuffer): ParsedStatement | null {
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error('Arquivo grande demais (máximo 5 MB).')
  const text = decodeText(buf)
  if (/<OFX>|OFXHEADER/i.test(text)) {
    const rows = parseOFX(text)
    return rows.length ? { rows, cardLike: false } : null
  }
  const r = parseCSVStatement(text)
  return r && r.rows.length ? r : null
}

// ---------------------------------------------------------------- categorias

export const CAT_RULES: [RegExp, string][] = [
  [/ifood|rappi|restaur|lanchon|padaria|pizz|burger|mcdonald|bk |subway|cafe|bar /, 'Alimentação'],
  [/mercado|supermerc|atacad|carrefour|assai|pao de acucar|extra |hortifr|sacolao|dia brasil/, 'Mercado'],
  [/uber|99 ?(pop|app|taxi)?|cabify|posto|shell|ipiranga|petrobras|combust|estacion|pedagio|sem parar|veloe|metro|bilhete/, 'Transporte'],
  [/netflix|spotify|disney|prime video|amazon prime|youtube|hbo|max |deezer|apple\.com|google one|icloud|globoplay|paramount/, 'Assinaturas'],
  [/farmac|drogasil|droga raia|drogaria|pague menos|panvel/, 'Saúde'],
  [/aluguel|condominio|energia|enel|light|cemig|copel|sabesp|agua|gas |claro|vivo|tim |oi |internet|net virtua/, 'Moradia'],
  [/amazon|mercado ?livre|shopee|aliexpress|magalu|magazine|americanas|shein|casas bahia/, 'Compras'],
  [/salario|folha|pagto salario|provento/, 'Salário'],
  [/rendimento|juros|cdb|tesouro|invest/, 'Investimentos'],
  [/pagamento de fatura|pgto fatura|fatura cartao/, 'Cartão de crédito'],
]

const STOP = /^(pix|compra|debito|credito|transf|transferencia|enviado|recebido|pagamento|para|com|de|do|da)$/

/** chave de aprendizado: as duas primeiras palavras que dizem algo ("uber trip" → "uber trip") */
export function ruleKey(desc: string): string {
  return normTxt(desc)
    .replace(/[^a-z ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.test(w))
    .slice(0, 2)
    .join(' ')
}

export type CatRules = Record<string, string>

export function guessCategory(desc: string, isIn: boolean, learned: CatRules = {}): string {
  const k = ruleKey(desc)
  if (k && Object.prototype.hasOwnProperty.call(learned, k) && learned[k]) return learned[k]
  const n = ' ' + normTxt(desc) + ' '
  for (const [re, cat] of CAT_RULES) if (re.test(n)) return cat
  if (isIn && /pix|transf|ted|doc/.test(n)) return 'Transferências'
  return isIn ? 'Entrada' : 'Outros'
}

/** categorias para sugerir no campo (lançamentos, contas fixas, cartão, regras e orçamento) */
export function knownCategories(data: AppData, rules: CatRules = {}): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (c: unknown) => {
    const s = String(c ?? '').trim()
    const k = normTxt(s)
    if (!s || seen.has(k)) return
    seen.add(k)
    out.push(s)
  }
  Object.keys(data.budgets ?? {}).forEach(push)
  data.transactions.forEach((t) => {
    if (t.type === 'gasto' || t.type === 'entrada') push(t.category)
  })
  data.cardPurchases.forEach((p) => push(p.category))
  data.bills.forEach((b) => {
    if (b.kind !== 'entrada') push(b.category || b.name)
  })
  CAT_RULES.forEach((r) => push(r[1]))
  Object.values(rules).forEach(push)
  return out
}

// ---------------------------------------------------------------- prévia

/** hash curto (djb2) do texto, igual ao hashStr do app antigo (as chaves de importação batem) */
export function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export interface ImportItem {
  i: number
  date: ISODate
  /** valor como veio no arquivo */
  raw: number
  desc: string
  /** chave que impede importar duas vezes */
  imp: string
  /** já importado antes */
  dupe: boolean
}

export const importKey = (r: StatementRow) => (r.fid ? 'f:' + r.fid : 'h:' + hashStr(r.date + '|' + r.amount + '|' + r.desc))

/** chaves de importação que já existem (lançamentos e compras no cartão) */
export function knownImports(data: Pick<AppData, 'transactions' | 'cardPurchases'>): Set<string> {
  const known = new Set<string>()
  data.transactions.forEach((t) => t.imp && known.add(t.imp))
  data.cardPurchases.forEach((p) => p.imp && known.add(p.imp))
  return known
}

/** mais recentes primeiro, no máximo MAX_PREVIEW, com a marca de duplicado */
export function buildItems(rows: StatementRow[], known: Set<string>): { items: ImportItem[]; total: number } {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const items = sorted.slice(0, MAX_PREVIEW).map((r, i) => {
    const imp = importKey(r)
    return { i, date: r.date, raw: r.amount, desc: r.desc, imp, dupe: known.has(imp) }
  })
  return { items, total: rows.length }
}

export interface ItemView {
  item: ImportItem
  /** valor com o sinal já invertido (se for o caso) */
  amount: number
  guess: string
  /** motivo para não vir marcado ('' = vem marcado) */
  why: string
  /** não dá para marcar */
  skip: boolean
  /** vem marcado */
  checked: boolean
}

/**
 * Como cada linha aparece na prévia. Em cartão, só gasto vira compra (pagamento/estorno fica de fora);
 * em carteira, lançamento de mesmo dia e valor que já existe (sem chave de importação) vem desmarcado.
 */
export function viewItems(
  items: ImportItem[],
  opts: { flip: boolean; target: { kind: 'wallet' | 'card'; id: string }; transactions: Transaction[]; rules: CatRules },
): ItemView[] {
  const isCard = opts.target.kind === 'card'
  return items.map((item) => {
    const amount = opts.flip ? -item.raw : item.raw
    const guess = guessCategory(item.desc, amount > 0, opts.rules)
    const sameDay =
      !isCard &&
      opts.transactions.some((t) => t.walletId === opts.target.id && t.date === item.date && Math.abs(t.amount - Math.abs(amount)) < 0.005 && !t.imp)
    const skip = item.dupe || (isCard && amount >= 0)
    const why = item.dupe ? 'já importado' : isCard && amount >= 0 ? 'pagamento/estorno: não entra como compra' : sameDay ? 'parece repetido' : ''
    return { item, amount, guess, why, skip, checked: !skip && !sameDay }
  })
}

// ---------------------------------------------------------------- gravação

export interface ImportChoice {
  item: ImportItem
  /** categoria escolhida */
  category: string
  /** categoria sugerida (se mudou, o app aprende) */
  guess: string
}

export interface ImportResult {
  tx: number
  cp: number
  learned: number
}

/** adiciona as linhas marcadas ao armazenamento; aprende as categorias que a pessoa corrigiu */
export function applyImport(
  api: StoreApi,
  choices: ImportChoice[],
  opts: { flip: boolean; target: { kind: 'wallet' | 'card'; id: string } },
): ImportResult {
  const res: ImportResult = { tx: 0, cp: 0, learned: 0 }
  const rules: CatRules = { ...((api.raw.catRules as CatRules | undefined) ?? {}) }
  const isCard = opts.target.kind === 'card'
  // ids únicos mesmo com centenas de linhas no mesmo milissegundo
  const base = newId()
  let seq = 0
  const uid = () => base + (seq++).toString(36)
  for (const c of choices) {
    const amt = opts.flip ? -c.item.raw : c.item.raw
    const cat = c.category.trim().slice(0, 40) || (amt < 0 ? 'Outros' : 'Entrada')
    if (cat !== c.guess) {
      const k = ruleKey(c.item.desc)
      if (k) {
        rules[k] = cat
        res.learned++
      }
    }
    if (isCard) {
      if (amt >= 0) continue
      const p: CardPurchase = {
        id: 'p-' + uid(),
        cardId: opts.target.id,
        desc: c.item.desc.slice(0, 50),
        amount: round2(-amt),
        installments: 1,
        date: c.item.date,
        category: cat,
        imp: c.item.imp,
      }
      api.cardPurchases.push(p)
      res.cp++
    } else {
      const t: Transaction = {
        id: uid(),
        walletId: opts.target.id,
        type: amt < 0 ? 'gasto' : 'entrada',
        amount: round2(Math.abs(amt)),
        date: c.item.date,
        category: cat,
        note: c.item.desc.slice(0, 80),
        imp: c.item.imp,
      }
      api.transactions.push(t)
      res.tx++
    }
  }
  if (res.learned) api.raw.catRules = rules
  return res
}

/** quantos lançamentos, compras e categorias novas a importação criaria (sem gravar nada) */
export function countImport(
  choices: ImportChoice[],
  opts: { flip: boolean; target: { kind: 'wallet' | 'card'; id: string } },
  rules: CatRules,
): ImportResult {
  const scratch: StoreApi = {
    debts: [], contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [],
    raw: { catRules: { ...rules } },
  }
  return applyImport(scratch, choices, opts)
}

/** categorias que o app já aprendeu (lidas do armazenamento; vazio se não houver) */
export function readCatRules(): CatRules {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return {}
    const r = (JSON.parse(raw) as { catRules?: unknown }).catRules
    if (!r || typeof r !== 'object' || Array.isArray(r)) return {}
    const out: CatRules = {}
    for (const [k, v] of Object.entries(r as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}
