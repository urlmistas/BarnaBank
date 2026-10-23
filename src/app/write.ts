import { useCallback } from 'react'
import { useToast } from '@/components/ui/toast'
import { commit, restore, type StoreApi } from '@/lib/store'

/**
 * Grava uma alteração e avisa com "Desfazer". Devolve true se gravou.
 * `message` é o que aparece no aviso (ex.: "Recebido R$ 50,00 de Ana").
 */
export function useWrite() {
  const toast = useToast()
  return useCallback(
    (message: string, fn: (api: StoreApi) => void, undoMessage = 'Desfeito'): boolean => {
      const r = commit(fn)
      if (!r.ok) {
        toast.show(r.error)
        return false
      }
      toast.show(message, () => {
        if (restore(r.before, r.after)) toast.show(undoMessage)
        else toast.show('Os dados mudaram depois deste lançamento, então não dá para desfazer.')
      })
      return true
    },
    [toast],
  )
}
