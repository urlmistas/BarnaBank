import type { Debt } from '@/lib/types'
import { nameKey } from '@/lib/finance/people'
import { shareLinkFor } from '@/lib/shares/shares'
import { STORAGE_KEY } from '@/lib/storage'
import { readBotCfg } from '@/lib/sync/worker'

/**
 * Link de cobrança já criado para esta dívida (ou, na falta, para a pessoa), para ir no rodapé da mensagem de
 * WhatsApp. Devolve '' se não há link ou o bot não está ligado. Só lê: criar o link é com o diálogo de links.
 */
export function chargeLinkFor(debt: Debt): string {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '{}') as { shares?: unknown }
    const url = readBotCfg().url
    return shareLinkFor(raw.shares, url, 'debt', debt.id) || shareLinkFor(raw.shares, url, 'person', nameKey(debt.name))
  } catch {
    return ''
  }
}
