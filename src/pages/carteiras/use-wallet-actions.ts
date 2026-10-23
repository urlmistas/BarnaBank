import { useWrite } from '@/app/write'
import { removeTx, removeWallet } from '@/lib/finance/wallet-mutations'
import type { Wallet } from '@/lib/types'

/** exclusões de Carteiras, com o texto do aviso de "Desfazer" */
export function useWalletActions() {
  const write = useWrite()
  return {
    deleteWallet: (w: Wallet) => write('Carteira excluída', (api) => removeWallet(api, w.id), 'Carteira restaurada'),
    deleteTx: (txId: string, label: string) => write(`Lançamento de ${label} removido`, (api) => void removeTx(api, txId), 'Lançamento restaurado'),
  }
}
