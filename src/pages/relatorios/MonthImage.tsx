import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import type { AppData, YearMonth } from '@/lib/types'
import { drawMonthImage, monthSummary } from './month-image'

interface Preview {
  url: string
  blob: Blob
  file: string
  title: string
}

/** Botão "Resumo em imagem": gera a imagem do mês, mostra a prévia e baixa ou compartilha. */
export function MonthImageButton({ data, today, month }: { data: AppData; today: string; month: YearMonth }) {
  const { money, date } = useAppData()
  const toast = useToast()
  const [preview, setPreview] = useState<Preview | null>(null)

  const make = () => {
    const s = monthSummary(data, month, today)
    const cv = drawMonthImage(s, money, date(today))
    cv.toBlob((blob) => {
      if (!blob) return toast.show('Não consegui gerar a imagem neste navegador.')
      setPreview({ url: cv.toDataURL('image/png'), blob, file: `barnabank-${month}.png`, title: `Resumo de ${s.title}` })
    }, 'image/png')
  }

  const close = () => setPreview(null)
  const share = async () => {
    if (!preview) return
    const file = new File([preview.blob], preview.file, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: preview.title })
      } catch {
        /* a pessoa fechou a janela de compartilhar */
      }
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(preview.blob)
    a.download = preview.file
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

  return (
    <>
      <Button size="sm" variant="outline" onClick={make}>
        <ImageIcon aria-hidden="true" />
        Resumo em imagem
      </Button>
      <Modal open={preview !== null} onClose={close} title={preview?.title ?? 'Resumo do mês'}>
        {preview && (
          <div className="px-5 py-4">
            <img src={preview.url} alt={preview.title} className="max-h-[60dvh] w-full rounded-md border border-border object-contain" />
            <p className="mt-3 text-xs text-fg-subtle">Guarde para comparar os meses ou mande para quem divide as contas com você.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={close}>
                Fechar
              </Button>
              <Button onClick={share}>{canShare ? 'Compartilhar' : 'Baixar imagem'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
