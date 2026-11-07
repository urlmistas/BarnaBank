// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { Pessoas } from './Pessoas'
import { clickAction } from '@/test-menu'

const cloud = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }))
vi.mock('@/lib/cloud', async (orig) => ({
  ...(await orig<typeof import('@/lib/cloud')>()),
  readSession: () => cloud.session,
  validSession: async (_f: unknown, s: unknown) => s,
  pullState: async () => ({ data: {
      debts: [{ id: 'c1', name: 'Nuvem', kind: 'receivable', principal: 10, rate: 0, interestType: 'composto', installments: 1, days: 30, date: '2020-01-01', dueDay: 1, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '' }],
      contacts: {}, wallets: [], transactions: [], groups: [], bills: [], cards: [], cardPurchases: [], cardPayments: [],
    }, settings: {}, updatedAt: '2026-01-01T00:00:00Z' }),
}))

const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 100, rate: 0, interestType: 'composto', installments: 1, days: 30,
  date: '2020-01-01', dueDay: 1, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)

function seed(extra: Record<string, unknown> = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt()], budgets: { Mercado: 500 }, goals: [{ id: 'g1' }], ...extra }))
}

function mount(path = '/pessoas/ana%20souza') {
  render(
    <DataProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/pessoas" element={<Pessoas />} />
            <Route path="/pessoas/:id" element={<Pessoas />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </DataProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  cloud.session = null
  // jsdom não implementa <dialog>: abre/fecha pelo atributo `open`
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())
configure({ asyncUtilTimeout: 5000 })

describe('Pessoas: escrita', () => {
  it('"Recebi" registra o pagamento e preserva os campos desconhecidos', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Recebi/ }))
    await waitFor(() => expect(stored().debts[0].payments).toHaveLength(1))
    const out = stored()
    expect(out.debts[0].payments[0]).toMatchObject({ amount: 100, mode: 'fifo' })
    expect(out.budgets).toEqual({ Mercado: 500 })
    expect(out.goals).toEqual([{ id: 'g1' }])
    // dívida quitada: some o botão de pagamento rápido
    await waitFor(() => expect(screen.queryByRole('button', { name: /Recebi/ })).toBeNull())
  })

  it('"Desfazer" volta ao estado anterior', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Recebi/ }))
    await waitFor(() => expect(stored().debts[0].payments).toHaveLength(1))
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().debts[0].payments).toHaveLength(0))
  })

  it('"Nova dívida" valida e grava', async () => {
    seed()
    mount('/pessoas')
    fireEvent.click(await screen.findByRole('button', { name: /Nova dívida/ }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    fireEvent.click(within(dlg).getByRole('button', { name: 'Adicionar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/nome do amigo/)
    fireEvent.change(within(dlg).getByLabelText('Nome do amigo'), { target: { value: 'Bruno' } })
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '1.250,50' } })
    fireEvent.change(within(dlg).getByLabelText('Parcelas'), { target: { value: '5' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(stored().debts).toHaveLength(2))
    expect(stored().debts[1]).toMatchObject({ name: 'Bruno', principal: 1250.5, installments: 5, kind: 'receivable', payments: [] })
    expect(stored().budgets).toEqual({ Mercado: 500 })
  })

  it('"Nova dívida" no perfil da pessoa já vem com o nome dela e grava para ela', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Nova dívida/ }))
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    expect((within(dlg).getByLabelText('Nome do amigo') as HTMLInputElement).value).toBe('Ana Souza')
    fireEvent.change(within(dlg).getByLabelText('Valor (R$)'), { target: { value: '80' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Adicionar' }))
    await waitFor(() => expect(stored().debts).toHaveLength(2))
    expect(stored().debts[1]).toMatchObject({ name: 'Ana Souza', principal: 80, kind: 'receivable' })
  })

  it('a pessoa tem página própria com saldo, números e resumo', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888', tags: ['Família'], notes: 'Paga no dia 5' } } })
    mount()
    expect((await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })).textContent).toBe('Ana Souza')
    expect(screen.getByText('Total emprestado')).toBeTruthy()
    const resumo = screen.getByRole('complementary', { name: /Informações de Ana Souza/ })
    expect(within(resumo).getByText('Dívidas em aberto')).toBeTruthy()
    expect(within(resumo).getByText('Próximo vencimento')).toBeTruthy()
    expect(within(resumo).getByText('Família')).toBeTruthy()
    expect(within(resumo).getByText('Paga no dia 5')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Conversar/ }).getAttribute('href')).toBe('https://wa.me/5511999998888')
    // a lista de pessoas não aparece ao lado: é uma página inteira, com volta para a lista
    expect(screen.queryByRole('list', { name: 'Pessoas' })).toBeNull()
    expect(screen.getByRole('link', { name: /Pessoas/ })).toBeTruthy()
  })

  it('as abas ficam no topo e a aba Gráfico mostra pagamentos e pontualidade', async () => {
    seed({ debts: [debt({ payments: [{ date: '2026-10-05', amount: 40 }] })] })
    mount()
    const tablist = await screen.findByRole('tablist', { name: /Informações de Ana Souza/ })
    const resumo = screen.getByRole('complementary', { name: /Informações de Ana Souza/ })
    // as abas vêm antes da barra lateral (Resumo), na ordem do documento
    expect(tablist.compareDocumentPosition(resumo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(resumo).getByText('Quitação prevista')).toBeTruthy()
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Gráfico' }))
    expect(await screen.findByRole('region', { name: 'Pagamentos por mês' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Pontualidade' })).toBeTruthy()
  })

  it('os cards do topo têm ícone e cor: recebido verde, atraso vermelho, o resto neutro', async () => {
    seed({ debts: [debt({ payments: [{ date: '2020-02-01', amount: 30 }] })] })
    mount()
    const cor = (rotulo: string) => {
      const dt = screen.getAllByText(rotulo).map((e) => e.closest('dt')).find(Boolean)!
      return { icone: dt.querySelector('svg')?.getAttribute('class') ?? '', valor: dt.nextElementSibling?.getAttribute('class') ?? '' }
    }
    await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })
    expect(cor('Falta receber').icone).toContain('text-fg-subtle')
    expect(cor('Total emprestado').icone).toContain('text-fg-subtle')
    expect(cor('Já recebi').icone).toContain('text-pos')
    expect(cor('Já recebi').valor).toContain('text-pos')
    expect(cor('Em atraso').icone).toContain('text-neg')
  })

  it('lápis com dica ao lado do nome, antes da etiqueta de status; sem o telefone na página', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888' } } })
    mount()
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })
    const lapis = screen.getByRole('button', { name: 'Editar pessoa' })
    const etiqueta = screen.getByText('Em atraso', { selector: 'span.rounded-full' })
    expect(h1.compareDocumentPosition(lapis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lapis.compareDocumentPosition(etiqueta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(lapis.parentElement?.querySelector('[role="tooltip"]')?.textContent).toBe('Editar pessoa')
    expect(screen.queryByText('(11) 99999-8888')).toBeNull()
  })

  it('confiança e resumo ficam no mesmo card, confiança primeiro, e o resumo conta dívidas em atraso', async () => {
    seed({ debts: [debt(), debt({ id: 'd2', principal: 50 })] })
    mount()
    const lateral = await screen.findByRole('complementary', { name: /Informações de Ana Souza/ })
    const nota = await within(lateral).findByText(/Confiança|Confiança: sem histórico/)
    const resumo = within(lateral).getByRole('heading', { name: 'Resumo' })
    expect(nota.compareDocumentPosition(resumo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // um único card: nota e resumo têm o mesmo ancestral <section>
    expect(nota.closest('section')).toBe(resumo.closest('section'))
    const linha = within(lateral).getByText('Dívidas em atraso').closest('div')!
    expect(linha.textContent).toMatch(/2 · 2 parcelas|2 · /)
  })

  it('dívida quitada fica opaca e com selo "Quitada"; a em aberto não', async () => {
    seed({ debts: [debt({ id: 'q1', payments: [{ date: '2020-01-05', amount: 100 }] }), debt({ id: 'a1', principal: 70 })] })
    mount()
    await screen.findByRole('heading', { level: 1, name: 'Ana Souza' })
    const selo = await screen.findByText('Quitada', { selector: 'span' })
    const quitada = selo.closest('section')!
    expect(quitada.className).toContain('opacity-60')
    // título riscado, barra cheia e verde, fita no canto e já dobrada
    expect(quitada.querySelector('.line-through')).toBeTruthy()
    expect(quitada.querySelector('[role="progressbar"] > span')?.className).toContain('bg-pos')
    expect(quitada.querySelector('[role="progressbar"] > span')?.getAttribute('style')).toContain('width: 100%')
    expect(selo.className).toContain('-rotate-45')
    expect(quitada.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded')).toBe('false')
    // a dívida em aberto (a1, R$ 70) não ganha o efeito
    const aberta = screen.getAllByRole('region').find((r) => r !== selo.closest('section') && r.getAttribute('data-slot') === 'card' && /R\$\s?70/.test(r.textContent ?? ''))
    expect(aberta?.className ?? '').not.toContain('opacity-60')
  })

  it('a aba da pessoa diz "Me deve", tem Linha do tempo e o gráfico traz a evolução do saldo', async () => {
    seed({ debts: [debt({ payments: [{ date: '2026-10-05', amount: 40 }] })] })
    mount()
    const tablist = await screen.findByRole('tablist', { name: /Informações de Ana Souza/ })
    expect(within(tablist).getByRole('tab', { name: /^Me deve/ })).toBeTruthy()
    expect(within(tablist).queryByRole('tab', { name: /Me devem/ })).toBeNull()
    // Linha do tempo fica ao lado de Calendário
    const names = within(tablist).getAllByRole('tab').map((t) => t.textContent)
    expect(names.indexOf('Linha do tempo')).toBe(names.indexOf('Calendário') + 1)
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Linha do tempo' }))
    const lista = await screen.findByRole('list', { name: /Linha do tempo de Ana Souza/ })
    expect(within(lista).getByText('Pagamento recebido')).toBeTruthy()
    expect(within(lista).getByText(/Empréstimo criado/)).toBeTruthy()
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Gráfico' }))
    expect(await screen.findByRole('region', { name: 'Evolução do saldo' })).toBeTruthy()
  })

  it('"Exportar ficha" abre o documento da pessoa', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888', notes: 'Paga dia 5' } } })
    const win = { document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } }
    vi.stubGlobal('open', vi.fn(() => win))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Exportar ficha/ }))
    const html = win.document.write.mock.calls[0][0] as string
    expect(html).toContain('Ficha da pessoa')
    expect(html).toContain('Ana Souza')
    expect(html).toContain('Paga dia 5')
  })

  it('excluir dívida pede confirmação', async () => {
    seed()
    mount()
    await clickAction('Excluir')
    const dlg = document.querySelector<HTMLElement>('dialog[open]')!
    expect(stored().debts).toHaveLength(1)
    fireEvent.click(within(dlg).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().debts).toHaveLength(0))
  })

  it('com a conta ativa continua editando neste aparelho (sincronização falhando não bloqueia)', async () => {
    seed()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    cloud.session = { access: 'a', refresh: 'r', exp: 9999999999, uid: 'u', email: 'a@b.com' }
    mount('/pessoas')
    expect(await screen.findByRole('button', { name: /Nova dívida/ })).toBeTruthy()
    expect(screen.queryByText(/saia da conta/)).toBeNull()
  })
})
