import type { Transaction } from '@/lib/types'
import type { MpMov } from '@/lib/sync/mpconta'

// Mercado Pago → carteiras: cada entrada e saída que o bot viu vira um lançamento na carteira escolhida.
// O id do lançamento ('mp<id do pagamento>') e a chave de importação ('mp:<id>') evitam lançar duas vezes,
// mesmo abrindo o app em dois aparelhos.

export const mpImpKey = (id: string) => 'mp:' + id

/** data (AAAA-MM-DD) no horário de Brasília */
const brDate = (iso: string): string => new Date(Date.parse(iso) - 3 * 3600000).toISOString().slice(0, 10)

const categoryOf = (m: Pick<MpMov, 'tipo' | 'label' | 'sinal'>): string => {
  if (m.sinal > 0) return m.label === 'Pix recebido' ? 'Pix recebido' : 'Entrada'
  return m.label === 'Pix enviado' ? 'Transferências' : 'Outros'
}

/** só o que ainda não está nas carteiras (o guardado nos porquinhos não entra: é dinheiro seu que só mudou de lugar) */
export function mpNewTransactions(movs: MpMov[], walletId: string, existing: Transaction[]): Transaction[] {
  const known = new Set<string>()
  for (const t of existing) if (t.imp) known.add(t.imp)
  const out: Transaction[] = []
  for (const m of movs) {
    if (m.tipo !== 'entrada' && m.tipo !== 'saida' && m.tipo !== 'aporte') continue
    if (!(m.valor > 0) || known.has(mpImpKey(m.id)) || isNaN(Date.parse(m.at))) continue
    out.push({
      id: 'mp' + m.id,
      walletId,
      type: m.sinal > 0 ? 'entrada' : 'gasto',
      amount: Math.round(m.valor * 100) / 100,
      date: brDate(m.at),
      category: categoryOf(m),
      note: m.label + ' · Mercado Pago',
      imp: mpImpKey(m.id),
    })
  }
  return out
}
