import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Copy, MessageCircle, Share2, X } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { useWrite } from '@/app/write'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { whatsPhone } from '@/lib/finance/groups'
import { useBotExtras } from '@/lib/shares/bot-extras'
import {
  addShare, firstName, removeShare, shareFor, shareTitle, shareUrl, shareWaText, viewsText, type ShareType,
} from '@/lib/shares/shares'
import { useBotCfg, useShares } from '@/lib/shares/use-shares'
import { botOn } from '@/lib/sync/worker'
import { contactKey } from '@/lib/store'
import { cn } from '@/lib/utils'

// Link de cobrança: página só de leitura no bot (<bot>/s/<token>). Aqui só se cria, copia e desativa o link; a página em si
// é montada pelo worker a partir do snapshot que o app sincroniza.

/** copia para a área de transferência; devolve false se o navegador não deixar */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function ShareButton({ type, refKey, label, className, variant = 'ghost' }: { type: ShareType; refKey: string; label: string; className?: string; variant?: 'ghost' | 'outline' }) {
  const [open, setOpen] = useState(false)
  const shares = useShares()
  const live = !!shareFor(shares, type, refKey)
  return (
    <>
      <Button variant={variant} size="sm" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Share2 aria-hidden="true" />
        {type === 'group' ? 'Link do grupo' : type === 'owe' ? 'Link do que devo' : type === 'debt' ? 'Link' : 'Link de cobrança'}
        {live && <span role="img" aria-label="link ativo" title="ativo" className="size-1.5 rounded-full bg-pos" />}
      </Button>
      <ShareDialog open={open} onClose={() => setOpen(false)} type={type} refKey={refKey} label={label} />
    </>
  )
}

export function ShareDialog({ open, onClose, type, refKey, label }: { open: boolean; onClose: () => void; type: ShareType; refKey: string; label: string }) {
  return (
    <Modal open={open} onClose={onClose} title={shareTitle(type, label)}>
      <ShareBody type={type} refKey={refKey} label={label} onClose={onClose} />
    </Modal>
  )
}

function ShareBody({ type, refKey, label, onClose }: { type: ShareType; refKey: string; label: string; onClose: () => void }) {
  const { today, canEdit, refreshCloud, result, baseSettings } = useAppData()
  const write = useWrite()
  const toast = useToast()
  const cfg = useBotCfg()
  const shares = useShares()
  const { extras, reload } = useBotExtras()
  const token = shareFor(shares, type, refKey)
  const on = botOn(cfg)
  const url = token ? shareUrl(cfg.url, token) : ''
  const owe = type === 'owe'
  const phone = type === 'group' ? '' : whatsPhone(result?.data.contacts[contactKey(label)]?.phone)
  const hasPix = typeof baseSettings.pixKey === 'string' && baseSettings.pixKey.trim() !== ''
  const hasOwner = typeof baseSettings.ownerName === 'string' && baseSettings.ownerName.trim() !== ''

  if (!on) {
    return (
      <div className="px-5 py-4 text-sm">
        <p className="text-fg-muted">
          O link fica hospedado no seu bot, na sua conta da Cloudflare. Ligue em <b className="text-fg">Configurações → Nuvem e bot do Telegram</b> e tente de novo.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button asChild onClick={onClose}>
            <Link to="/configuracoes">Abrir Configurações</Link>
          </Button>
        </div>
      </div>
    )
  }

  const create = () => {
    const ok = write(
      'Link criado. Em instantes ele fica no ar.',
      (api) => {
        addShare(api.raw, type, refKey, today)
      },
      'Link desfeito',
    )
    // sobe os dados agora: é o worker que monta a página do link
    if (ok) refreshCloud()
  }

  const off = () => {
    if (!token) return
    const ok = write(
      'Link desativado: quem tiver o link não vê mais nada',
      (api) => {
        removeShare(api.raw, token)
      },
      'Link reativado',
    )
    if (ok) {
      refreshCloud()
      onClose()
    }
  }

  if (!token) {
    return (
      <div className="px-5 py-4 text-sm">
        <p className="text-fg-muted">{whoSees(type, label)} Atualiza sozinho quando você mexe no app.</p>
        {!canEdit && <p className="mt-3 text-xs text-fg-subtle">Só dá para criar o link com os dados deste aparelho.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={create} disabled={!canEdit}>
            <Share2 aria-hidden="true" /> Criar link
          </Button>
        </div>
      </div>
    )
  }

  const wa = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(shareWaText(type, label, url))
  return (
    <div className="px-5 py-4 text-sm">
      <p className="text-fg-muted">{whoSees(type, label)} Atualiza sozinho quando você mexe no app.</p>
      <Input readOnly aria-label="Endereço do link" value={url} onClick={(e) => e.currentTarget.select()} className="mt-3" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={async () => toast.show((await copyText(url)) ? 'Link copiado' : 'Não consegui copiar. Selecione o endereço e copie.')}
        >
          <Copy aria-hidden="true" /> Copiar
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" /> WhatsApp
          </a>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ArrowUpRight aria-hidden="true" /> Abrir<span className="sr-only"> (abre em outra aba)</span>
          </a>
        </Button>
      </div>
      <p className={cn('mt-3 text-xs text-fg-muted')} aria-live="polite">
        {viewsText(extras.views[token], today)}{' '}
        <button type="button" onClick={() => void reload()} className="cursor-pointer underline-offset-4 hover:text-fg hover:underline">
          Atualizar
        </button>
      </p>
      {!owe && !hasPix && <p className="mt-3 text-xs text-fg-subtle">Dica: cadastre sua chave Pix em Configurações para o link mostrar o QR e o “copia e cola” com o valor certo.</p>}
      {!hasOwner && <p className="mt-1 text-xs text-fg-subtle">Dica: cadastre seu nome em Configurações para ele aparecer no link.</p>}
      {canEdit && (
        <div className="mt-5 flex justify-between gap-2">
          <Button variant="ghost" size="sm" className="text-neg hover:text-neg" onClick={off}>
            <X aria-hidden="true" /> Desativar link
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      )}
    </div>
  )
}

function whoSees(type: ShareType, label: string): string {
  if (type === 'group') return `Quem abrir vê o ${label}: quanto cada um já pagou e quanto falta, e o seu Pix.`
  if (type === 'owe') return `Quem abrir vê só o que você deve a ${firstName(label)}: quanto já foi pago, quanto falta pra quitar e as parcelas. Não tem Pix nem botão de pagar. O resto do app fica de fora.`
  if (type === 'debt') return `Quem abrir vê só esta dívida de ${firstName(label)}: parcelas, pagamentos e o seu Pix. As outras dívidas e o resto do app ficam de fora.`
  return `Quem abrir vê só as dívidas de ${firstName(label)} com você: parcelas, pagamentos e o seu Pix. Nada do resto do app.`
}
