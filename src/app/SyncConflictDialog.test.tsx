// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { STORAGE_KEY } from '@/lib/storage'
import { SESSION_KEY } from '@/lib/cloud'
import { DataProvider } from './data-context'
import { SyncConflictDialog } from './SyncConflictDialog'

// Integração: DataProvider de verdade, Supabase de mentira (fetch), diálogo "Qual versão manter?"

const debt = (id: string) => ({ id, name: 'Ana', kind: 'receivable', principal: 100, date: '2026-01-01', days: 30, payments: [] })
const ids = () => (JSON.parse(localStorage.getItem(STORAGE_KEY)!).debts as { id: string }[]).map((d) => d.id)

interface Srv {
  row: { data: Record<string, unknown>; updated_at: string } | null
  calls: { method: string; url: string }[]
}
let srv: Srv

function mount() {
  render(
    <DataProvider>
      <SyncConflictDialog />
    </DataProvider>,
  )
}

beforeEach(() => {
  configure({ asyncUtilTimeout: 5000 })
  localStorage.clear()
  // jsdom não implementa <dialog>: abre/fecha pelo atributo `open`
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify({ access: 'a', refresh: 'r', exp: 9999999999, uid: 'u1', email: 'eu@x.com' }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt('do-aparelho')], budgets: { Mercado: 1 } }))
  srv = { row: { data: { app: 'BarnaBank', debts: [debt('da-conta')] }, updated_at: 'T2' }, calls: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      srv.calls.push({ method, url })
      if (method === 'GET') return new Response(JSON.stringify(srv.row ? [srv.row] : []))
      if (method === 'PATCH' || method === 'POST') {
        const body = JSON.parse(String(init!.body)) as { data: Record<string, unknown>; updated_at: string }
        srv.row = { data: body.data, updated_at: 'T3' }
        return new Response(JSON.stringify([srv.row]))
      }
      return new Response('{}', { status: 404 })
    }),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Qual versão manter?', () => {
  it('aparelho e conta diferentes: abre o diálogo e não troca nada sozinho', async () => {
    mount()
    const dlg = await waitFor(() => {
      const d = document.querySelector<HTMLElement>('dialog[open]')
      if (!d) throw new Error('diálogo fechado')
      return d
    })
    expect(within(dlg).getByRole('heading', { name: 'Qual versão manter?' })).toBeTruthy()
    expect(ids()).toEqual(['do-aparelho'])
    expect(srv.calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('"Usar os da conta" adota a conta e guarda cópia do que havia', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Usar os da conta' }))
    await waitFor(() => expect(ids()).toEqual(['da-conta']))
    expect(JSON.parse(localStorage.getItem('bbweb_backup_prev')!).data).toContain('do-aparelho')
    expect(document.querySelector('dialog[open]')).toBeNull()
    expect(srv.calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('"Manter deste aparelho" sobe os dados daqui por cima da conta, com campos desconhecidos', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Manter deste aparelho' }))
    await waitFor(() => expect(srv.row?.updated_at).toBe('T3'))
    expect((srv.row!.data.debts as { id: string }[]).map((d) => d.id)).toEqual(['do-aparelho'])
    expect(srv.row!.data.budgets).toEqual({ Mercado: 1 })
    expect(srv.calls.some((c) => c.method === 'PATCH' && c.url.includes('updated_at=eq.T2'))).toBe(true)
    expect(ids()).toEqual(['do-aparelho'])
  })

  it('"Decidir depois" fecha sem trocar nem enviar nada', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Decidir depois' }))
    await waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull())
    expect(ids()).toEqual(['do-aparelho'])
    expect(srv.calls.every((c) => c.method === 'GET')).toBe(true)
  })
})
