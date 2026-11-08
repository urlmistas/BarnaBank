// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '@/lib/storage'
import { HISTORY_KEY, MAX_ENTRIES, applyUndo, canUndo, clearHistory, diffRaw, markUndone, readHistory, recordChange, undoEntry } from './history'

beforeEach(() => localStorage.clear())

const j = (o: unknown) => JSON.stringify(o)
const raw = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
const put = (o: unknown) => localStorage.setItem(STORAGE_KEY, j(o))

const d = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: 'Ana', principal: 100, payments: [], ...extra })

describe('histórico: diff e inverso', () => {
  it('só guarda o item que mudou, não a lista inteira', () => {
    const before = { debts: [d('a'), d('b'), d('c')], budgets: { Mercado: 500 } }
    const after = { debts: [d('a'), d('b', { payments: [{ id: 'p1', amount: 10 }] }), d('c')], budgets: { Mercado: 500 } }
    const p = diffRaw(j(before), j(after))!
    expect(Object.keys(p)).toEqual(['debts'])
    expect(p.debts).toMatchObject({ t: 'list', items: [{ id: 'b' }] })
    expect((p.debts as { items: unknown[] }).items).toHaveLength(1)
  })

  it('nada mudou: sem patch', () => {
    expect(diffRaw(j({ debts: [d('a')] }), j({ debts: [d('a')] }))).toBeNull()
  })

  it('desfaz item alterado, criado, apagado (na posição de antes) e mapa de contatos', () => {
    const before = { debts: [d('a'), d('b'), d('c')], contacts: { ana: { phone: '1' }, bia: { phone: '2' } }, budgets: { X: 1 } }
    const after = {
      debts: [d('a', { principal: 999 }), d('c'), d('n')], // a mudou, b apagado, n criado
      contacts: { ana: { phone: '1' }, caio: { phone: '3' } }, // bia saiu, caio entrou
      budgets: { X: 2 },
    }
    const p = diffRaw(j(before), j(after))!
    expect(canUndo(after, p)).toBe(true)
    expect(applyUndo(after, p)).toEqual(before)
  })

  it('apagar o primeiro e o último volta nas posições certas', () => {
    const before = { debts: [d('a'), d('b'), d('c'), d('e')] }
    const after = { debts: [d('b'), d('c')] }
    const p = diffRaw(j(before), j(after))!
    expect(applyUndo(after, p)).toEqual(before)
  })

  it('chave nova inteira (não lista) volta a não existir', () => {
    const before = { debts: [] }
    const after = { debts: [], goals: [{ nome: 'x' }] }
    const p = diffRaw(j(before), j(after))!
    expect(applyUndo(after, p)).toEqual(before)
  })

  it('recusa se o item foi mexido depois', () => {
    const before = { debts: [d('a')] }
    const after = { debts: [d('a', { principal: 5 })] }
    const p = diffRaw(j(before), j(after))!
    expect(canUndo({ debts: [d('a', { principal: 6 })] }, p)).toBe(false)
    expect(canUndo({ debts: [] }, p)).toBe(false)
  })
})

describe('histórico: gravação e Desfazer', () => {
  const t0 = new Date('2026-11-08T10:00:00Z')

  it('registra a mensagem e o horário; igual ao anterior não registra', () => {
    const a = j({ debts: [d('a')] })
    const b = j({ debts: [d('a', { principal: 1 })] })
    expect(recordChange('Pago R$ 1,00', a, b, t0)).toBeTruthy()
    expect(recordChange('nada', b, b, t0)).toBeNull()
    expect(readHistory()).toMatchObject([{ msg: 'Pago R$ 1,00', at: '2026-11-08T10:00:00.000Z' }])
  })

  it('desfazer volta os dados, marca a entrada e não deixa desfazer duas vezes', () => {
    const before = { debts: [d('a'), d('b')], contacts: { ana: { phone: '1' } } }
    const after = { debts: [d('a')], contacts: { ana: { phone: '2' } } }
    put(after)
    const id = recordChange('Dívida excluída', j(before), j(after), t0)!
    expect(undoEntry(id)).toBe('ok')
    expect(raw()).toEqual(before)
    expect(readHistory()[0].undone).toBe(true)
    expect(undoEntry(id)).toBe('already')
  })

  it('recusa e não mexe nos dados quando algo foi alterado depois', () => {
    const before = { debts: [d('a')] }
    const after = { debts: [d('a', { principal: 5 })] }
    put(after)
    const id = recordChange('Editou', j(before), j(after), t0)!
    put({ debts: [d('a', { principal: 77 })] })
    expect(undoEntry(id)).toBe('changed')
    expect(raw().debts[0].principal).toBe(77)
    expect(readHistory()[0].undone).toBeUndefined()
  })

  it('alteração enorme (foto) fica no histórico, mas sem Desfazer', () => {
    const big = 'x'.repeat(70_000)
    const before = { contacts: { ana: { name: 'Ana' } } }
    const after = { contacts: { ana: { name: 'Ana', photo: big } } }
    put(after)
    const id = recordChange('Foto trocada', j(before), j(after), t0)!
    expect(readHistory()[0].patch).toBeNull()
    expect(undoEntry(id)).toBe('big')
  })

  it('guarda no máximo MAX_ENTRIES, as mais novas', () => {
    for (let i = 0; i < MAX_ENTRIES + 5; i++) recordChange('m' + i, j({ debts: [d('a', { principal: i })] }), j({ debts: [d('a', { principal: i + 1 })] }), t0)
    const h = readHistory()
    expect(h).toHaveLength(MAX_ENTRIES)
    expect(h[h.length - 1].msg).toBe('m' + (MAX_ENTRIES + 4))
  })

  it('markUndone e clearHistory; histórico corrompido vira lista vazia', () => {
    const id = recordChange('x', j({ debts: [] }), j({ debts: [d('a')] }), t0)!
    markUndone(id)
    expect(readHistory()[0].undone).toBe(true)
    clearHistory()
    expect(readHistory()).toEqual([])
    localStorage.setItem(HISTORY_KEY, '{ruim')
    expect(readHistory()).toEqual([])
  })
})
