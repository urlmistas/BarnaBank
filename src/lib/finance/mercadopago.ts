import type { Transaction, Wallet } from '@/lib/types'
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

/** o Mercado Pago é a carteira principal: uma carteira com este nome, criada sozinha se não existir */
export const MP_WALLET = 'Mercado Pago'
export const isMpWallet = (w: Pick<Wallet, 'name'>) => w.name.trim().toLowerCase() === MP_WALLET.toLowerCase()

/**
 * Ao informar os valores reais (ou ligar a integração pela primeira vez) o saldo da carteira passa a ser o total do
 * Mercado Pago (conta + porquinhos): um lançamento de ajuste cobre a diferença. null = já está igual.
 */
export function mpAdjustment(total: number, balance: number, walletId: string, date: string, key: string): Transaction | null {
  const diff = Math.round((total - balance) * 100) / 100
  if (Math.abs(diff) < 0.01) return null
  return {
    id: 'mpaj' + key,
    walletId,
    type: diff > 0 ? 'entrada' : 'gasto',
    amount: Math.abs(diff),
    date,
    category: 'Ajuste Mercado Pago',
    note: 'Ajuste ao informar os valores do Mercado Pago',
    imp: 'mp:ajuste:' + key,
  }
}

/** data de hoje (AAAA-MM-DD) no horário de Brasília */
export const mpToday = (now = new Date()): string => new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10)
