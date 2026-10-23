import {
  Banknote, Briefcase, Building2, Car, Coins, CreditCard, Gem, Gift, House, Landmark, PiggyBank, Plane, ShoppingBag, Smartphone, Vault, Wallet,
  type LucideIcon,
} from 'lucide-react'
import { walletIconKey } from '@/lib/storage'
import { cn } from '@/lib/utils'

// Ícones de carteira do app antigo (WALLET_ICONS ~l.69). Ícone gravado como emoji ou texto livre continua aparecendo como texto.
const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  'credit-card': CreditCard,
  landmark: Landmark,
  banknote: Banknote,
  'piggy-bank': PiggyBank,
  coins: Coins,
  vault: Vault,
  smartphone: Smartphone,
  building: Building2,
  briefcase: Briefcase,
  gem: Gem,
  gift: Gift,
  'shopping-bag': ShoppingBag,
  house: House,
  car: Car,
  plane: Plane,
}

/** ícone da carteira; valor desconhecido (emoji antigo) vira texto */
export function WalletIcon({ icon, className }: { icon: unknown; className?: string }) {
  const key = walletIconKey(icon)
  const Icon = ICONS[key]
  if (!Icon) return <span aria-hidden="true" className={cn('text-base leading-none', className)}>{key}</span>
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', className)} />
}
