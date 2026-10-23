import { useMemo } from 'react'
import { useAppData } from '@/app/data-context'
import type { DocCtx } from './documents'

/** dados comuns dos documentos imprimíveis: moeda, data, carteiras e quem assina */
/** `issuedAt` entra na hora de gerar o documento (new Date() no clique, não na renderização) */
export function useDocCtx(): Omit<DocCtx, 'issuedAt'> {
  const { today, money, date, result, baseSettings } = useAppData()
  const wallets = result?.data.wallets
  return useMemo(
    () => ({
      today,
      money,
      date,
      wallets: wallets ?? [],
      ownerName: String(baseSettings.ownerName ?? ''),
      ownerCity: String(baseSettings.ownerCity ?? ''),
    }),
    [today, money, date, wallets, baseSettings],
  )
}
