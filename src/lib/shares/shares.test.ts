import { describe, expect, it, vi } from 'vitest'
import type { Fetch } from '@/lib/cloud'
import { decideClaim, fetchBotExtras, fetchClaimPhoto, parseExtras } from './bot-extras'
import { addShare, isShareToken, newShareToken, readShares, removeShare, shareFor, shareLinkFor, shareTitle, shareUrl, shareWaText, viewsText } from './shares'

const TOKEN = 'abcdefghijkmnopqrstuv'

describe('token', () => {
  it('tem 22 caracteres válidos, sem letras ambíguas', () => {
    for (let i = 0; i < 50; i++) {
      const t = newShareToken()
      expect(t).toHaveLength(22)
      expect(isShareToken(t)).toBe(true)
      expect(t).not.toMatch(/[lIO01]/)
    }
  })

  it('o gerador aleatório é injetável', () => {
    expect(newShareToken((n) => new Uint8Array(n))).toBe('a'.repeat(22))
  })
})

describe('shares no JSON cru', () => {
  it('lê só os links válidos', () => {
    const s = readShares({
      [TOKEN]: { type: 'person', ref: 'ana', created: '2026-01-01' },
      curto: { type: 'person', ref: 'x' },
      [TOKEN + 'x']: { type: 'estranho', ref: 'x' },
      [TOKEN + 'y']: { type: 'group' },
    })
    expect(Object.keys(s)).toEqual([TOKEN])
    expect(readShares(null)).toEqual({})
    expect(readShares([1])).toEqual({})
  })

  it('addShare grava no formato que o motor do bot espera e preserva os outros links', () => {
    const raw: Record<string, unknown> = { shares: { outro: { type: 'person', ref: 'bia' } } }
    const t = addShare(raw, 'person', 'ana', '2026-03-15', TOKEN)
    expect(t).toBe(TOKEN)
    expect(raw.shares).toEqual({ outro: { type: 'person', ref: 'bia' }, [TOKEN]: { type: 'person', ref: 'ana', created: '2026-03-15' } })
    expect(shareFor(readShares(raw.shares), 'person', 'ana')).toBe(TOKEN)
    expect(shareFor(readShares(raw.shares), 'owe', 'ana')).toBeNull()
  })

  it('addShare cria o objeto quando não existe', () => {
    const raw: Record<string, unknown> = {}
    addShare(raw, 'group', 'g-1', '2026-03-15', TOKEN)
    expect(Object.keys(raw.shares as object)).toEqual([TOKEN])
  })

  it('removeShare devolve o que havia (para o Desfazer) e não mexe nos outros', () => {
    const raw: Record<string, unknown> = {}
    addShare(raw, 'person', 'ana', '2026-03-15', TOKEN)
    addShare(raw, 'person', 'bia', '2026-03-15', TOKEN.replace('a', 'z'))
    const old = removeShare(raw, TOKEN)
    expect(old).toMatchObject({ type: 'person', ref: 'ana' })
    expect(Object.keys(raw.shares as object)).toHaveLength(1)
    expect(removeShare(raw, 'nao-existe')).toBeUndefined()
  })
})

describe('url e textos', () => {
  it('monta o link com o endereço do bot', () => {
    expect(shareUrl('https://bot.workers.dev/', TOKEN)).toBe('https://bot.workers.dev/s/' + TOKEN)
    expect(shareUrl(undefined, TOKEN)).toBe('')
  })

  it('shareLinkFor só devolve link existente', () => {
    const raw: Record<string, unknown> = {}
    addShare(raw, 'group', 'g-1', '2026-03-15', TOKEN)
    expect(shareLinkFor(raw.shares, 'https://b.dev', 'group', 'g-1')).toBe('https://b.dev/s/' + TOKEN)
    expect(shareLinkFor(raw.shares, 'https://b.dev', 'group', 'g-2')).toBe('')
  })

  it('mensagens e títulos por tipo', () => {
    expect(shareWaText('group', 'Churrasco', 'U')).toContain('*Churrasco*')
    expect(shareWaText('owe', 'Carlos Silva', 'U')).toContain('Oi Carlos!')
    expect(shareWaText('person', 'Ana Souza', 'U')).toContain('Oi Ana!')
    expect(shareTitle('owe', 'Carlos Silva')).toBe('Link do que devo · Carlos')
    expect(shareTitle('group', 'X')).toBe('Link do grupo')
  })

  it('texto de visualizações', () => {
    expect(viewsText(undefined, '2026-03-15')).toBe('Ainda não foi aberto.')
    const t = viewsText({ count: 3, last: '2026-03-14T14:05:00Z' }, '2026-03-15', new Date('2026-03-14T14:05:00Z'))
    expect(t).toMatch(/^Aberto 3 vezes · último ontem às /)
    expect(viewsText({ count: 1, last: '2026-03-15T10:00:00Z' }, '2026-03-15', new Date('2026-03-15T10:00:00Z'))).toMatch(/^Aberto 1 vez · último hoje/)
  })
})

describe('bot: pedidos e visualizações', () => {
  const cfg = { url: 'https://bot.dev/', key: 'segredo-123' }
  const resp = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

  it('parseExtras descarta lixo e normaliza o tipo', () => {
    const x = parseExtras({
      claims: [{ id: 'c1', label: 'Ana', at: '2026-03-15T10:00:00Z', amount: '50', kind: 'prazo', newDate: '2026-04-01' }, { id: 5 }, null],
      views: { t: { count: 2, last: '2026-03-15T10:00:00Z' }, ruim: { count: 1 } },
      bot: 'meubot',
    })
    expect(x.claims).toHaveLength(1)
    expect(x.claims[0]).toMatchObject({ id: 'c1', kind: 'prazo', amount: 50 })
    expect(Object.keys(x.views)).toEqual(['t'])
    expect(x.bot).toBe('meubot')
    expect(parseExtras('x')).toEqual({ claims: [], views: {}, bot: '' })
  })

  it('GET /api/state com a chave só no cabeçalho', async () => {
    const f = vi.fn<Fetch>(async () => resp({ claims: [], views: {}, bot: 'b' }))
    await fetchBotExtras(f, cfg)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('https://bot.dev/api/state')
    expect(url).not.toContain('segredo')
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.Authorization).toBe('Bearer segredo-123')
  })

  it('chave errada vira erro com status 401', async () => {
    await expect(fetchBotExtras(async () => resp({}, 401), cfg)).rejects.toMatchObject({ status: 401 })
  })

  it('decideClaim manda a decisão e avisa quando já estava decidido', async () => {
    const f = vi.fn<Fetch>(async () => resp({ ok: true }))
    expect(await decideClaim(f, cfg, 'cl1', true)).toBe('done')
    expect(f.mock.calls[0][0]).toBe('https://bot.dev/api/claim/cl1')
    expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({ decision: 'ok' })
    expect(JSON.parse((await (async () => { await decideClaim(f, cfg, 'cl2', false); return f.mock.calls[1][1] })())?.body as string)).toEqual({ decision: 'no' })
    expect(await decideClaim(async () => resp({ already: 'ok' }), cfg, 'cl1', true)).toBe('already')
  })

  it('foto do comprovante só aceita imagem', async () => {
    expect(await fetchClaimPhoto(async () => resp({ data: 'data:image/jpeg;base64,AAA' }), cfg, 'c')).toBe('data:image/jpeg;base64,AAA')
    expect(await fetchClaimPhoto(async () => resp({ data: 'javascript:alert(1)' }), cfg, 'c')).toBeNull()
    expect(await fetchClaimPhoto(async () => resp({}, 404), cfg, 'c')).toBeNull()
  })
})
