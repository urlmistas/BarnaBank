import type { Wallet } from '@/lib/types'

/** nome da carteira que uma versão anterior criava sozinha para o Mercado Pago (hoje o Início soma o total do painel direto) */
export const MP_WALLET = 'Mercado Pago'
export const isMpWallet = (w: Pick<Wallet, 'name'>) => w.name.trim().toLowerCase() === MP_WALLET.toLowerCase()
