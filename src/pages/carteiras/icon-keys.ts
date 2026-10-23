import { WALLET_ICONS } from '@/lib/storage'

const LABEL: Record<string, string> = {
  wallet: 'Carteira', 'credit-card': 'Cartão', landmark: 'Banco', banknote: 'Dinheiro', 'piggy-bank': 'Poupança', coins: 'Moedas', vault: 'Cofre',
  smartphone: 'Celular', building: 'Prédio', briefcase: 'Trabalho', gem: 'Joia', gift: 'Presente', 'shopping-bag': 'Compras', house: 'Casa', car: 'Carro',
  plane: 'Viagem',
}

export const ICON_KEYS = WALLET_ICONS
export const iconLabel = (key: string) => LABEL[key] ?? key

