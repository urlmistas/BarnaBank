import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_KEY, STORAGE_KEY } from '@/lib/storage'
import { BACKUP_PREV_KEY } from '@/lib/sync/snapshot'
import { applyImport, backupReminder, buildBackupFile, markBackupDone, parseBackup, restoreBackupPrev, LAST_EXPORT_KEY, BANNER_SNOOZE_KEY } from './backup'

const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Ana', kind: 'receivable', principal: 100, date: '2026-01-10', days: 30, installments: 1, payments: [], ...over,
})

let m: Map<string, string>
beforeEach(() => {
  m = new Map()
  vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) })
  vi.stubGlobal('dispatchEvent', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('parseBackup', () => {
  it('recusa texto que não é JSON e objeto sem dívidas', () => {
    expect(parseBackup('{quebrado')).toMatchObject({ ok: false, error: expect.stringMatching(/ler esse arquivo/) })
    expect(parseBackup('{"wallets":[]}')).toMatchObject({ ok: false, error: expect.stringMatching(/não parece/) })
  })

  it('aceita lista pura de dívidas e descarta as inválidas', () => {
    const r = parseBackup(JSON.stringify([debt(), debt({ id: 'x', principal: 0 }), debt({ id: 'y', name: ' ' }), debt({ id: 'z', date: 'ontem' })]), {})
    if (!r.ok) throw new Error('falhou')
    expect(r.plan.skipped).toBe(3)
    expect((r.plan.snapshot.debts as unknown[]).length).toBe(1)
    expect(r.plan.lines[0]).toEqual({ label: 'Dívidas', from: 0, to: 1 })
  })

  it('filtra pagamentos inválidos, dá id a dívida sem id e troca ícone antigo de carteira', () => {
    const r = parseBackup(
      JSON.stringify({
        debts: [debt({ id: '', payments: [{ date: '2026-02-01', amount: 10 }, { date: '2026-02-02', amount: 0 }, { date: 5, amount: 3 }] })],
        wallets: [{ id: 'w1', name: 'Nubank', icon: '💳' }, { id: 'w2' }],
      }),
      {},
    )
    if (!r.ok) throw new Error('falhou')
    const d = (r.plan.snapshot.debts as { id: string; payments: unknown[] }[])[0]
    expect(d.id).toBeTruthy()
    expect(d.payments).toHaveLength(1)
    expect(r.plan.snapshot.wallets).toEqual([{ id: 'w1', name: 'Nubank', icon: 'credit-card' }])
  })

  it('o que o arquivo não traz fica fora do plano (as listas atuais continuam)', () => {
    const r = parseBackup(JSON.stringify({ debts: [debt()] }), { wallets: [{ id: 'w' }], transactions: [{ id: 't' }] })
    if (!r.ok) throw new Error('falhou')
    expect(r.plan.snapshot).not.toHaveProperty('wallets')
    expect(r.plan.snapshot).not.toHaveProperty('transactions')
    expect(r.plan.lines.map((l) => l.label)).toEqual(['Dívidas'])
  })

  it('só deixa passar configurações conhecidas', () => {
    const r = parseBackup(JSON.stringify({ debts: [debt()], settings: { pixKey: 'a', virus: 1, currency: 'USD' } }), {})
    if (!r.ok) throw new Error('falhou')
    expect(r.plan.snapshot.settings).toEqual({ pixKey: 'a', currency: 'USD' })
  })

  it('dívida de grupo que não existe mais vira individual', () => {
    const r = parseBackup(JSON.stringify({ debts: [debt({ groupId: 'g9' })], groups: [] }), {})
    if (!r.ok) throw new Error('falhou')
    expect((r.plan.snapshot.debts as Record<string, unknown>[])[0].groupId).toBeUndefined()
  })
})

describe('applyImport', () => {
  it('troca os dados, guarda a cópia anterior e preserva o que o arquivo não traz', async () => {
    m.set(STORAGE_KEY, JSON.stringify({ debts: [debt({ id: 'velha' })], wallets: [{ id: 'w1', name: 'Mantida' }], budgets: { Mercado: 1 }, goals: [] }))
    m.set(SETTINGS_KEY, JSON.stringify({ currency: 'BRL', soAqui: 1 }))
    const r = parseBackup(JSON.stringify({ debts: [debt({ id: 'nova' })], settings: { pixKey: 'k' } }))
    if (!r.ok) throw new Error('falhou')
    await applyImport(r.plan)
    const out = JSON.parse(m.get(STORAGE_KEY)!)
    expect(out.debts.map((d: { id: string }) => d.id)).toEqual(['nova'])
    expect(out.wallets).toEqual([{ id: 'w1', name: 'Mantida' }])
    expect(out.budgets).toEqual({ Mercado: 1 })
    expect(JSON.parse(m.get(SETTINGS_KEY)!)).toEqual({ currency: 'BRL', soAqui: 1, pixKey: 'k' })
    expect(JSON.parse(m.get(BACKUP_PREV_KEY)!).data).toContain('velha')
  })

  it('restoreBackupPrev volta ao que havia', async () => {
    const before = JSON.stringify({ debts: [debt({ id: 'velha' })] })
    m.set(STORAGE_KEY, before)
    const r = parseBackup(JSON.stringify({ debts: [debt({ id: 'nova' })] }))
    if (!r.ok) throw new Error('falhou')
    await applyImport(r.plan)
    expect(restoreBackupPrev()).toBe(true)
    expect(m.get(STORAGE_KEY)).toBe(before)
    expect(m.has(BACKUP_PREV_KEY)).toBe(false)
    expect(restoreBackupPrev()).toBe(false)
  })
})

describe('buildBackupFile', () => {
  it('sai com settings, chaves desconhecidas e receipts', async () => {
    m.set(STORAGE_KEY, JSON.stringify({ debts: [debt()], tgLog: { a: 1 } }))
    m.set(SETTINGS_KEY, JSON.stringify({ pixKey: 'k' }))
    const f = await buildBackupFile(new Date('2026-03-01T10:00:00Z'))
    expect(f).toMatchObject({ app: 'BarnaBank', version: 2, settings: { pixKey: 'k' }, tgLog: { a: 1 }, receipts: {} })
  })
})

describe('lembrete', () => {
  const base = { enabled: true, debts: 3, today: '2026-03-20', lastExport: null, snoozeUntil: null }
  it('nunca exportou', () => expect(backupReminder(base)).toMatch(/nenhum backup/))
  it('faz 14 dias ou mais', () => expect(backupReminder({ ...base, lastExport: '2026-03-06' })).toBe('Já faz 14 dias sem backup dos seus dados.'))
  it('menos de 14 dias, desligado, sem dívidas ou adiado: nada', () => {
    expect(backupReminder({ ...base, lastExport: '2026-03-10' })).toBeNull()
    expect(backupReminder({ ...base, enabled: false })).toBeNull()
    expect(backupReminder({ ...base, debts: 0 })).toBeNull()
    expect(backupReminder({ ...base, snoozeUntil: '2026-03-20' })).toBeNull()
    expect(backupReminder({ ...base, snoozeUntil: '2026-03-19' })).not.toBeNull()
  })
  it('markBackupDone grava o dia e tira o adiamento', () => {
    m.set(BANNER_SNOOZE_KEY, '2026-03-25')
    markBackupDone('2026-03-20')
    expect(m.get(LAST_EXPORT_KEY)).toBe('2026-03-20')
    expect(m.has(BANNER_SNOOZE_KEY)).toBe(false)
  })
})
