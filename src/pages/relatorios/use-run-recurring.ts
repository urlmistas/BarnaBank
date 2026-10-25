import { useEffect } from 'react'
import { useAppData } from '@/app/data-context'
import { postRecurring } from '@/lib/finance/plan-store'
import { runRecurring } from '@/lib/finance/recurring'
import { commit } from '@/lib/store'

/**
 * Lança os recorrentes que já venceram (o antigo faz isso ao abrir o app, ~l.6555). Só com dados deste aparelho.
 * Idempotente: depois de gravar, não há mais nada a lançar e o efeito não grava de novo.
 * Está montado em Relatórios; vale montar também num lugar que abra sempre (AppShell) quando houver chance.
 */
export function useRunRecurring() {
  const { result, today, canEdit } = useAppData()
  const data = result?.data
  const pending = !!data && canEdit && runRecurring(data.recurring ?? [], data.transactions, data.wallets, today).made > 0
  useEffect(() => {
    if (pending) commit((api) => void postRecurring(api, today))
  }, [pending, today])
}
