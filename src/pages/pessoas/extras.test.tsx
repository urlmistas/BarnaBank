// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DataProvider } from '@/app/data-context'
import { ToastProvider } from '@/components/ui/toast'
import { STORAGE_KEY } from '@/lib/storage'
import { Pessoas } from './Pessoas'
import { choose } from '@/test-select'
import { actionNames, clickAction } from '@/test-menu'

const debt = (over: Record<string, unknown> = {}) => ({
  id: 'd1', name: 'Ana Souza', kind: 'receivable', principal: 300, rate: 0, interestType: 'composto', installments: 3, days: 90,
  date: '2020-01-10', dueDay: 10, payments: [], discount: 0, lateFeePct: 0, lateInterestPct: 0, notes: '', ...over,
})

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!)

function seed(extra: Record<string, unknown> = {}, settings?: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ debts: [debt()], budgets: { Mercado: 500 }, ...extra }))
  if (settings) localStorage.setItem('barnabank_settings_v1', JSON.stringify(settings))
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

const openDialog = () => document.querySelector<HTMLElement>('dialog[open]')!

beforeEach(() => {
  localStorage.clear()
  window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(cleanup)
configure({ asyncUtilTimeout: 5000 })

describe('Pessoas: renegociar e mais prazo', () => {
  it('renegociar troca o plano, mostra a prévia e o Desfazer volta', async () => {
    seed()
    mount()
    await clickAction('Renegociar')
    const dlg = openDialog()
    // 3 parcelas de 100 vencidas e sem encargos: faltam 300; parcelas de 150 viram 2x
    fireEvent.change(within(dlg).getByLabelText('Novo valor da parcela'), { target: { value: '150' } })
    await within(dlg).findByText('Fica assim')
    expect(within(dlg).getByText(/2x de R\$/)).toBeTruthy()
    fireEvent.change(within(dlg).getByLabelText('Motivo (opcional)'), { target: { value: 'combinado' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Renegociar' }))
    await waitFor(() => expect(stored().debts[0].plan).toHaveLength(2))
    const d = stored().debts[0]
    expect(d.plan.map((p: { v: number }) => p.v)).toEqual([150, 150])
    expect(d.installments).toBe(2)
    expect(d.reneg[0].note).toBe('combinado')
    expect(stored().budgets).toEqual({ Mercado: 500 })
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().debts[0].plan).toBeUndefined())
  })

  it('valor inválido mostra o erro e não grava', async () => {
    seed()
    mount()
    await clickAction('Renegociar')
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Novo valor da parcela'), { target: { value: '0' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Renegociar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/Confira o novo valor/)
    expect(stored().debts[0].plan).toBeUndefined()
  })

  it('mais prazo remarca a parcela atrasada e valida a data', async () => {
    seed()
    mount()
    await clickAction('Mais prazo')
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Novo vencimento'), { target: { value: '2020-01-01' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remarcar' }))
    expect((await within(dlg).findByRole('alert')).textContent).toMatch(/depois do vencimento atual/)
    fireEvent.change(within(dlg).getByLabelText('Novo vencimento'), { target: { value: '2999-12-31' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remarcar' }))
    await waitFor(() => expect(Object.keys(stored().debts[0].dueOverride ?? {}).length).toBeGreaterThan(0))
    expect(Object.values(stored().debts[0].dueOverride).every((v) => v === '2999-12-31')).toBe(true)
  })

  it('dívida recorrente não oferece renegociar', async () => {
    seed({ debts: [debt({ kind: 'payable', recurring: { amount: 50, label: 'Netflix' }, installments: 1, principal: 50 })] })
    mount()
    const names = await actionNames()
    expect(names).toContain('Mais prazo')
    expect(names).not.toContain('Renegociar')
  })
})

describe('Pessoas: WhatsApp', () => {
  it('com telefone vira link wa.me com a mensagem pronta e o Pix', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888' } } }, { pixKey: 'ana@pix.com' })
    mount()
    const link = (await screen.findByRole('link', { name: /WhatsApp/ })) as HTMLAnchorElement
    expect(link.href.startsWith('https://wa.me/5511999998888?text=')).toBe(true)
    const text = decodeURIComponent(link.href.split('?text=')[1])
    expect(text).toContain('Oi Ana, tudo bem?')
    expect(text).toContain('*Pix:* ana@pix.com')
  })

  it('"Cobrar" no topo da pessoa em atraso abre o WhatsApp com a cobrança; sem telefone não aparece', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888' } } }, { pixKey: 'ana@pix.com' })
    mount()
    const cobrar = (await screen.findByRole('link', { name: 'Cobrar' })) as HTMLAnchorElement
    expect(cobrar.href.startsWith('https://wa.me/5511999998888?text=')).toBe(true)
    expect(decodeURIComponent(cobrar.href.split('?text=')[1])).toContain('*Pix:* ana@pix.com')
    cleanup()
    seed()
    mount()
    await screen.findByRole('heading', { name: 'Ana Souza' })
    expect(screen.queryByRole('link', { name: 'Cobrar' })).toBeNull()
  })

  it('"Cobrar" aparece no card da lista de quem está em atraso e tem telefone', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888' } } })
    mount('/pessoas?f=atrasados')
    const cobrar = (await screen.findByRole('link', { name: 'Cobrar Ana Souza' })) as HTMLAnchorElement
    expect(cobrar.href.startsWith('https://wa.me/5511999998888?text=')).toBe(true)
  })

  it('"Compartilhar" abre a folha de compartilhar com a cobrança, mesmo sem telefone; sem suporte o botão some', async () => {
    seed()
    mount()
    await screen.findByRole('heading', { name: 'Ana Souza' })
    expect(screen.queryByRole('button', { name: 'Compartilhar cobrança' })).toBeNull()
    cleanup()
    const share = vi.fn(async () => {})
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })
    try {
      mount()
      fireEvent.click(await screen.findByRole('button', { name: 'Compartilhar cobrança' }))
      expect(share).toHaveBeenCalledTimes(1)
      expect((share.mock.calls[0] as unknown as [{ text: string }])[0].text).toContain('Oi Ana, tudo bem?')
    } finally {
      Reflect.deleteProperty(navigator, 'share')
    }
  })

  it('celular: o card da lista tem "Recebi" nas ações de deslizar e dá baixa na parcela sem abrir a pessoa', async () => {
    seed()
    mount('/pessoas')
    const btn = await screen.findByRole('button', { name: /^Receber R\$\s.* de Ana Souza$/ })
    const before = stored().debts[0].payments.length
    fireEvent.click(btn)
    await waitFor(() => expect(stored().debts[0].payments.length).toBe(before + 1))
    expect(stored().debts[0].payments.at(-1)).toMatchObject({ mode: expect.any(String) })
  })

  it('celular: quem eu devo tem "Paguei"; quem não tem nada em aberto não tem ação', async () => {
    seed({ debts: [debt({ id: 'p1', name: 'Carlos', kind: 'payable' }), debt({ id: 'q1', name: 'Quitado', payments: [{ id: 'x', date: '2020-02-01', amount: 300, mode: 'fifo' }] })] })
    mount('/pessoas')
    expect(await screen.findByRole('button', { name: /^Pagar R\$\s.* a Carlos$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Quitado/ })).toBeNull()
  })

  it('sem telefone o botão avisa onde cadastrar', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /WhatsApp/ }))
    expect(await screen.findByText(/Cadastre o telefone em "Editar pessoa"/)).toBeTruthy()
  })

  it('o link de cobrança já criado entra no rodapé', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888' } }, shares: { abcdefghijklmnop: { type: 'debt', ref: 'd1', created: '2026-01-01' } } })
    localStorage.setItem('barnabank_cloud', JSON.stringify({ url: 'https://bot.exemplo.dev/', key: 'k' }))
    mount()
    const link = (await screen.findByRole('link', { name: /WhatsApp/ })) as HTMLAnchorElement
    expect(decodeURIComponent(link.href)).toContain('*Detalhes:* https://bot.exemplo.dev/s/abcdefghijklmnop')
  })
})

describe('Pessoas: etiquetas, notas e confiança', () => {
  it('salva etiquetas e notas no contato, sem perder o telefone', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888' } } })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Editar pessoa/ }))
    const dlg = openDialog()
    fireEvent.click(within(dlg).getByRole('button', { name: 'Família' }))
    fireEvent.change(within(dlg).getByLabelText('Outra etiqueta'), { target: { value: 'Vizinha' } })
    fireEvent.change(within(dlg).getByLabelText(/Notas sobre Ana/), { target: { value: 'recebe dia 5' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(stored().contacts['ana souza'].tags).toEqual(['Família', 'Vizinha']))
    expect(stored().contacts['ana souza']).toMatchObject({ phone: '11999998888', notes: 'recebe dia 5' })
    expect(await screen.findByText('recebe dia 5')).toBeTruthy()
  })

  it('edita o telefone da pessoa, atualiza o botão Conversar e permite apagar', async () => {
    seed({ contacts: { 'ana souza': { phone: '11999998888', tags: ['Amigo'] } } })
    mount()
    expect((await screen.findByRole('link', { name: /Conversar/ })).getAttribute('href')).toBe('https://wa.me/5511999998888')
    fireEvent.click(screen.getByRole('button', { name: /Editar pessoa/ }))
    let dlg = openDialog()
    const campo = within(dlg).getByLabelText('Telefone') as HTMLInputElement
    expect(campo.value).toBe('(11) 99999-8888')
    fireEvent.change(campo, { target: { value: '(43) 98888-7777' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(stored().contacts['ana souza'].phone).toBe('43988887777'))
    expect(stored().contacts['ana souza'].tags).toEqual(['Amigo'])
    await waitFor(() => expect(screen.getByRole('link', { name: /Conversar/ }).getAttribute('href')).toBe('https://wa.me/5543988887777'))

    fireEvent.click(screen.getByRole('button', { name: /Editar pessoa/ }))
    dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Telefone'), { target: { value: '' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(stored().contacts['ana souza'].phone).toBe(''))
  })

  it('renomear a pessoa muda todas as dívidas, leva o contato e abre a página nova', async () => {
    seed({
      debts: [debt(), debt({ id: 'd2', name: 'ana souza', principal: 50, installments: 1 })],
      contacts: { 'ana souza': { phone: '11999998888', tags: ['Amigo'] } },
      shares: { abcdefghijklmnop: { type: 'person', ref: 'ana souza', created: '2026-01-01' } },
    })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Editar pessoa/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'Ana Maria Souza' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(stored().debts.map((d: { name: string }) => d.name)).toEqual(['Ana Maria Souza', 'Ana Maria Souza']))
    expect(stored().contacts['ana souza']).toBeUndefined()
    expect(stored().contacts['ana maria souza']).toMatchObject({ phone: '11999998888', tags: ['Amigo'] })
    expect(stored().shares.abcdefghijklmnop.ref).toBe('ana maria souza')
    // a rota trocou para a chave nova: a página da pessoa continua aberta, sem "não encontrada"
    expect((await screen.findAllByText('Ana Maria Souza')).length).toBeGreaterThan(0)
  })

  it('nome de outra pessoa pede para juntar antes de salvar', async () => {
    seed({ debts: [debt(), debt({ id: 'd2', name: 'Bia Lima' })] })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Editar pessoa/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: 'bia lima' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText(/Marque a opção para juntar/)).toBeTruthy()
    expect(stored().debts[0].name).toBe('Ana Souza')
    fireEvent.click(within(dlg).getByRole('checkbox'))
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(stored().debts.map((d: { name: string }) => d.name)).toEqual(['Bia Lima', 'Bia Lima']))
  })

  it('nome vazio não salva', async () => {
    seed()
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /Editar pessoa/ }))
    const dlg = openDialog()
    fireEvent.change(within(dlg).getByLabelText('Nome'), { target: { value: '   ' } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Salvar' }))
    expect(await within(dlg).findByText('Informe o nome.')).toBeTruthy()
    expect(stored().debts[0].name).toBe('Ana Souza')
  })

  it('mostra a nota de confiança quando há parcela vencida', async () => {
    seed()
    mount()
    expect(await screen.findByText(/Confiança (arriscada|regular|boa|excelente)/)).toBeTruthy()
    expect(screen.getByText(/atrasado agora/)).toBeTruthy()
  })

  it('sem histórico mostra o aviso', async () => {
    seed({ debts: [debt({ date: '2999-01-10' })] })
    mount()
    expect(await screen.findByText(/Confiança: sem histórico ainda/)).toBeTruthy()
  })
})

describe('Pessoas: excluir conforme as Configurações', () => {
  it('confirmDelete ligado (padrão) pede confirmação', async () => {
    seed()
    mount()
    await clickAction('Excluir')
    expect(stored().debts).toHaveLength(1)
    fireEvent.click(within(openDialog()).getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(stored().debts).toHaveLength(0))
  })

  it('confirmDelete desligado exclui direto e oferece Desfazer', async () => {
    seed({}, { confirmDelete: false })
    mount()
    await clickAction('Excluir')
    await waitFor(() => expect(stored().debts).toHaveLength(0))
    expect(document.querySelector('dialog[open]')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(stored().debts).toHaveLength(1))
  })
})

describe('Pessoas: Me devem / Eu devo', () => {
  it('separa a lista por lado e mostra só o valor daquele lado', async () => {
    seed({
      debts: [
        debt({ id: 'a', name: 'Ana', principal: 100, installments: 1 }),
        debt({ id: 'b', name: 'Caio', kind: 'payable', principal: 50, installments: 1 }),
      ],
    })
    mount('/pessoas')
    const rows = () => screen.getAllByRole('link').filter((l) => l.hasAttribute('data-row')).map((l) => l.getAttribute('aria-label') ?? '')
    await screen.findByRole('list', { name: 'Pessoas' })
    expect(rows()).toHaveLength(2)
    fireEvent.click(screen.getByRole('radio', { name: /Eu devo/ }))
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(rows()[0]).toMatch(/^Caio/)
    fireEvent.click(screen.getByRole('radio', { name: /Me devem/ }))
    await waitFor(() => expect(rows()[0]).toMatch(/^Ana/))
    expect(rows()).toHaveLength(1)
  })
})

describe('Pessoas: ordenação e placar', () => {
  const two = () =>
    seed({
      debts: [
        debt({ id: 'a', name: 'Zeca', principal: 100, installments: 1 }),
        debt({ id: 'b', name: 'Ana', principal: 900, installments: 1 }),
      ],
    })
  const names = () => screen.getAllByRole('link').filter((l) => l.hasAttribute('data-row')).map((l) => l.textContent ?? '')

  it('ordenar por nome muda a ordem da lista e vai para a URL', async () => {
    two()
    mount('/pessoas')
    await screen.findByRole('list', { name: 'Pessoas' })
    choose(screen.getByLabelText('Ordenar por'), 'name')
    await waitFor(() => expect(names()[0]).toMatch(/^.*Ana/))
    choose(screen.getByLabelText('Ordenar por'), 'valueAsc')
    await waitFor(() => expect(names()[0]).toMatch(/Zeca/))
  })

  it('placar mostra a pontuação e as medalhas', async () => {
    two()
    mount('/pessoas')
    fireEvent.click(await screen.findByRole('button', { name: /Placar/ }))
    const dlg = openDialog()
    expect(within(dlg).getByRole('list', { name: 'Placar' })).toBeTruthy()
    expect(within(dlg).getAllByText(/devolveu/).length).toBe(2)
    expect(within(dlg).getByText(/Quem mais pegou/)).toBeTruthy()
  })

  it('placar sem empréstimos não aparece', async () => {
    seed({ debts: [debt({ kind: 'payable' })] })
    mount('/pessoas')
    await screen.findByRole('heading', { name: 'Pessoas' })
    expect(screen.queryByRole('button', { name: /Placar/ })).toBeNull()
  })
})

