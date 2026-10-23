import { useWrite } from '@/app/write'
import { removePayment } from '@/lib/finance/mutations'
import { replaceDebt } from '@/lib/store'
import type { Debt } from '@/lib/types'

/** ações de escrita de uma dívida, com o texto do aviso de "Desfazer" */
export function useDebtActions(debt: Debt) {
  const write = useWrite()
  return {
    removeDebt: () => write(`Dívida de ${debt.name} excluída`, (api) => (api.debts = api.debts.filter((d) => d.id !== debt.id)), 'Dívida restaurada'),
    removePayment: (index: number) =>
      write('Pagamento removido', (api) => replaceDebt(api, debt.id, (d) => removePayment(d, index)), 'Pagamento restaurado'),
  }
}
