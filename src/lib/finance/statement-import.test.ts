import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/types'
import type { StoreApi } from '@/lib/store'
import {
  applyImport, buildItems, decodeText, guessCategory, knownImports, parseAmt, parseCSVStatement, parseDateAny, parseOFX, parseStatement,
  ruleKey, viewItems, MAX_FILE_BYTES, MAX_PREVIEW, type StatementRow,
} from './statement-import'

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260305120000<TRNAMT>-45,90<FITID>abc1<MEMO>Compra IFOOD *Restaurante</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260306<TRNAMT>1500.00<FITID>abc2<NAME>Salario Empresa</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261399<TRNAMT>10<FITID>ruim<MEMO>data impossível</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260307<TRNAMT>lixo<FITID>ruim2<MEMO>valor ruim</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

const api = (over: Partial<StoreApi> = {}): StoreApi => ({
  debts: [], contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [], raw: {}, ...over,
})

describe('leitura', () => {
  it('OFX: lê as transações válidas e ignora data/valor ruins', () => {
    const rows = parseOFX(OFX)
    expect(rows).toEqual([
      { date: '2026-03-05', amount: -45.9, desc: 'Compra IFOOD *Restaurante', fid: 'abc1' },
      { date: '2026-03-06', amount: 1500, desc: 'Salario Empresa', fid: 'abc2' },
    ])
  })

  it('valor e data aceitam os formatos do Brasil', () => {
    expect(parseAmt('R$ 1.234,56')).toBe(1234.56)
    expect(parseAmt('-45,90')).toBe(-45.9)
    expect(parseAmt('(10,00)')).toBe(-10)
    expect(parseAmt('12,5-')).toBe(-12.5)
    expect(parseAmt('1,234.56')).toBe(1234.56)
    expect(parseAmt('abc')).toBeNaN()
    expect(parseDateAny('05/03/2026')).toBe('2026-03-05')
    expect(parseDateAny('5/3/26')).toBe('2026-03-05')
    expect(parseDateAny('2026-03-05T10:00')).toBe('2026-03-05')
    expect(parseDateAny('31/13/2026')).toBe('')
    expect(parseDateAny('lixo')).toBe('')
  })

  it('CSV com ; e cabeçalho depois de linhas de capa', () => {
    const csv = 'Extrato da conta\nPeríodo: março\nData;Descrição;Valor;Identificador\n05/03/2026;"Pix; enviado";-50,00;id1\n06/03/2026;Salário;2.000,00;id2\nxx;ruim;1;id3\n'
    const r = parseCSVStatement(csv)!
    expect(r.cardLike).toBe(false)
    expect(r.rows).toEqual([
      { date: '2026-03-05', amount: -50, desc: 'Pix; enviado', fid: 'id1' },
      { date: '2026-03-06', amount: 2000, desc: 'Salário', fid: 'id2' },
    ])
  })

  it('CSV de fatura (date,title,amount) é marcado como cartão', () => {
    const r = parseCSVStatement('date,category,title,amount\n2026-03-05,x,Uber,25.50\n')!
    expect(r.cardLike).toBe(true)
    expect(r.rows[0]).toMatchObject({ date: '2026-03-05', amount: 25.5, desc: 'Uber' })
  })

  it('formato desconhecido devolve null; arquivo grande demais é recusado', () => {
    const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer
    expect(parseStatement(enc('qualquer coisa sem colunas'))).toBeNull()
    expect(() => parseStatement(new ArrayBuffer(MAX_FILE_BYTES + 1))).toThrow(/grande demais/)
    expect(parseStatement(enc(OFX))!.rows).toHaveLength(2)
  })

  it('latin1: cai para windows-1252 quando o utf-8 quebra', () => {
    const bytes = new Uint8Array([0x53, 0x61, 0x6c, 0xe1, 0x72, 0x69, 0x6f]) // "Salário" em latin1
    expect(decodeText(bytes.buffer)).toBe('Salário')
  })
})

describe('categorias', () => {
  it('regras embutidas, regras aprendidas e chave de aprendizado', () => {
    expect(guessCategory('Compra IFOOD *Restaurante', false)).toBe('Alimentação')
    expect(guessCategory('UBER TRIP', false)).toBe('Transporte')
    expect(guessCategory('PIX recebido de Ana', true)).toBe('Transferências')
    expect(guessCategory('algo qualquer', false)).toBe('Outros')
    expect(guessCategory('algo qualquer', true)).toBe('Entrada')
    expect(ruleKey('PIX enviado Padaria Central')).toBe('padaria central')
    expect(guessCategory('Padaria Central', false, { 'padaria central': 'Café' })).toBe('Café')
  })

  it('uma chave "__proto__" nas regras aprendidas não vaza', () => {
    expect(guessCategory('constructor', false, {})).toBe('Outros')
  })
})

describe('prévia', () => {
  const rows: StatementRow[] = [
    { date: '2026-03-01', amount: -10, desc: 'A', fid: 'f1' },
    { date: '2026-03-02', amount: -20, desc: 'B', fid: '' },
    { date: '2026-03-03', amount: 30, desc: 'C', fid: '' },
  ]

  it('marca como duplicado o que já foi importado (por FITID ou por hash)', () => {
    const first = buildItems(rows, new Set())
    const known = new Set(first.items.filter((i) => i.desc !== 'C').map((i) => i.imp))
    const again = buildItems(rows, known)
    expect(again.items.map((i) => [i.desc, i.dupe])).toEqual([['C', false], ['B', true], ['A', true]])
    expect(first.items[0].desc).toBe('C') // mais recentes primeiro
  })

  it('knownImports lê lançamentos e compras', () => {
    const k = knownImports({ transactions: [{ imp: 'f:1' } as Transaction], cardPurchases: [{ imp: 'h:2' } as never] })
    expect([...k].sort()).toEqual(['f:1', 'h:2'])
  })

  it('limita a prévia aos mais recentes', () => {
    const many = Array.from({ length: MAX_PREVIEW + 50 }, (_, i) => ({ date: '2026-01-01', amount: -(i + 1), desc: 'x' + i, fid: '' }))
    const r = buildItems(many, new Set())
    expect(r.items).toHaveLength(MAX_PREVIEW)
    expect(r.total).toBe(MAX_PREVIEW + 50)
  })

  it('em cartão só gasto entra; em carteira, mesmo dia e valor sem chave vem desmarcado', () => {
    const { items } = buildItems(rows, new Set())
    const card = viewItems(items, { flip: false, target: { kind: 'card', id: 'c1' }, transactions: [], rules: {} })
    expect(card.find((v) => v.item.desc === 'C')).toMatchObject({ skip: true, checked: false })
    expect(card.find((v) => v.item.desc === 'A')).toMatchObject({ skip: false, checked: true })
    const flipped = viewItems(items, { flip: true, target: { kind: 'card', id: 'c1' }, transactions: [], rules: {} })
    expect(flipped.find((v) => v.item.desc === 'A')).toMatchObject({ skip: true }) // virou entrada
    expect(flipped.find((v) => v.item.desc === 'C')).toMatchObject({ skip: false })
    const tx = [{ id: 't', walletId: 'w1', type: 'gasto', amount: 20, date: '2026-03-02' }] as Transaction[]
    const wallet = viewItems(items, { flip: false, target: { kind: 'wallet', id: 'w1' }, transactions: tx, rules: {} })
    expect(wallet.find((v) => v.item.desc === 'B')).toMatchObject({ why: 'parece repetido', checked: false, skip: false })
  })
})

describe('gravação', () => {
  const { items } = buildItems(
    [
      { date: '2026-03-01', amount: -10, desc: 'Mercado Bom Preco', fid: '' },
      { date: '2026-03-02', amount: 50, desc: 'Venda', fid: '' },
    ],
    new Set(),
  )
  const choose = (cat: string) => items.map((item) => ({ item, category: cat || item.desc, guess: guessCategory(item.desc, item.raw > 0) }))

  it('carteira: cria lançamento por linha, com chave de importação e ids únicos', () => {
    const a = api()
    const r = applyImport(a, choose('Mercado'), { flip: false, target: { kind: 'wallet', id: 'w1' } })
    expect(r).toMatchObject({ tx: 2, cp: 0 })
    expect(a.transactions).toHaveLength(2)
    expect(new Set(a.transactions.map((t) => t.id)).size).toBe(2)
    expect(a.transactions.find((t) => t.type === 'gasto')).toMatchObject({ amount: 10, walletId: 'w1', date: '2026-03-01', imp: expect.stringMatching(/^h:/) })
    expect(a.transactions.find((t) => t.type === 'entrada')).toMatchObject({ amount: 50 })
  })

  it('cartão: só gasto vira compra; inverter sinais troca o que é gasto', () => {
    const a = api()
    applyImport(a, choose('X'), { flip: false, target: { kind: 'card', id: 'c1' } })
    expect(a.cardPurchases).toHaveLength(1)
    expect(a.cardPurchases[0]).toMatchObject({ cardId: 'c1', amount: 10, installments: 1, desc: 'Mercado Bom Preco' })
    const b = api()
    applyImport(b, choose('X'), { flip: true, target: { kind: 'card', id: 'c1' } })
    expect(b.cardPurchases.map((p) => p.amount)).toEqual([50])
  })

  it('aprende a categoria corrigida e preserva as regras que já existiam', () => {
    const a = api({ raw: { catRules: { outro: 'Lazer' } } })
    const r = applyImport(a, choose('Compras do mês'), { flip: false, target: { kind: 'wallet', id: 'w1' } })
    expect(r.learned).toBe(2)
    expect(a.raw.catRules).toMatchObject({ outro: 'Lazer', 'mercado bom': 'Compras do mês', venda: 'Compras do mês' })
  })

  it('sem correção não mexe nas regras', () => {
    const a = api()
    const same = items.map((item) => ({ item, category: guessCategory(item.desc, item.raw > 0), guess: guessCategory(item.desc, item.raw > 0) }))
    expect(applyImport(a, same, { flip: false, target: { kind: 'wallet', id: 'w1' } }).learned).toBe(0)
    expect(a.raw.catRules).toBeUndefined()
  })
})
