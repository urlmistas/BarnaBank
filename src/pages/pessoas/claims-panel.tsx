import { useEffect, useState } from 'react'
import { CalendarClock, Check, HandCoins, Image as ImageIcon } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { receiptIdOf, receiptStore } from '@/lib/receipts'
import { decideClaim, fetchClaimPhoto, useBotExtras, type Claim } from '@/lib/shares/bot-extras'
import { botErrorText, readBotCfg } from '@/lib/sync/worker'
import type { Debt } from '@/lib/types'
import { ConfirmDialog } from './dialogs'

// Pedidos feitos pelos links de cobrança: "já paguei" e "pedir mais prazo" (renderClaims ~l.7287).
// Confirmar ou recusar fala com o worker (POST /api/claim/<id>): ele mesmo lança o pagamento ou o novo prazo nos dados dele
// e o app só sincroniza depois para trazer o resultado.

export function ClaimsPanel() {
  const { extras, on, reload } = useBotExtras()
  const { debts } = useDebtsForPhotos()
  useTelegramPhotos(debts)
  const [asking, setAsking] = useState<{ claim: Claim; ok: boolean } | null>(null)
  const [photo, setPhoto] = useState<{ label: string; data: string | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { money, date, today, refreshCloud } = useAppData()
  const toast = useToast()
  if (!on || !extras.claims.length) return null

  const claims = extras.claims
  const nPay = claims.filter((c) => c.kind !== 'prazo').length
  const nPrazo = claims.length - nPay
  const head =
    nPay && nPrazo
      ? `${claims.length} pedidos pelos links`
      : nPrazo
        ? nPrazo === 1 ? 'Pediram mais prazo' : `${nPrazo} pedidos de prazo`
        : nPay === 1 ? 'Alguém disse que pagou' : `${nPay} pessoas disseram que pagaram`

  async function decide(c: Claim, ok: boolean) {
    setBusy(c.id)
    try {
      const r = await decideClaim((u, i) => globalThis.fetch(u, i), readBotCfg(), c.id, ok)
      if (r === 'already') toast.show('Esse pedido já tinha sido respondido.')
      else if (c.kind === 'prazo') toast.show(ok ? `Prazo de ${c.label} remarcado para ${date(c.newDate ?? '')}` : 'Pedido recusado. A pessoa vê isso no link.')
      else toast.show(ok ? `Confirmado: ${c.label} · ${money(c.amount)}` : 'Marcado como não recebido. A pessoa vê isso no link.')
      await reload()
      // traz para este aparelho o pagamento/prazo que o worker acabou de lançar
      if (ok && r === 'done') refreshCloud()
    } catch (e) {
      toast.show('Bot: ' + botErrorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function showPhoto(c: Claim) {
    setPhoto({ label: c.label, data: null })
    const data = await fetchClaimPhoto((u, i) => globalThis.fetch(u, i), readBotCfg(), c.id)
    setPhoto({ label: c.label, data })
  }

  return (
    <section aria-label="Pedidos pelos links" className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm">
        {nPay ? <HandCoins aria-hidden="true" className="size-4 text-fg-muted" /> : <CalendarClock aria-hidden="true" className="size-4 text-fg-muted" />}
        <b className="font-medium">{head}</b>
        <span className="text-xs text-fg-subtle">{nPay ? 'confira no banco' : 'você decide'}</span>
      </div>
      <ul>
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 last:border-b-0">
            <div className="min-w-0 flex-1">
              {c.kind === 'prazo' ? (
                <>
                  <p className="truncate text-sm font-medium">{c.label} pediu prazo até <span className="num">{date(c.newDate ?? '')}</span></p>
                  <p className="text-xs text-fg-subtle">
                    {c.amount ? <span className="num">{money(c.amount)}</span> : null}
                    {c.amount && c.due ? ` que ${c.due < today ? 'venceu' : 'vence'} em ` : ''}
                    {c.due ? <span className="num">{date(c.due)}</span> : null}
                    {c.note ? ` · “${c.note}”` : ''}
                  </p>
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-medium">
                    {c.label} · <span className="num">{money(c.amount)}</span>
                  </p>
                  <p className="text-xs text-fg-subtle">
                    <span className="num">{date(c.at.slice(0, 10))}</span>
                    {c.note ? ` · “${c.note}”` : ''}
                    {c.hasPhoto ? '' : ' · sem comprovante'}
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {c.kind !== 'prazo' && c.hasPhoto && (
                <Button size="icon" variant="ghost" className="size-8" aria-label={`Ver comprovante de ${c.label}`} title="Ver comprovante" onClick={() => void showPhoto(c)}>
                  <ImageIcon />
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => setAsking({ claim: c, ok: false })}>
                {c.kind === 'prazo' ? 'Recusar' : 'Não recebi'}
              </Button>
              <Button size="sm" disabled={busy === c.id} onClick={() => void decide(c, true)}>
                <Check aria-hidden="true" /> {c.kind === 'prazo' ? 'Aceitar' : 'Recebi'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {asking && (
        <ConfirmDialog
          open
          onClose={() => setAsking(null)}
          title={asking.claim.kind === 'prazo' ? 'Recusar o pedido?' : 'Não recebeu?'}
          okLabel={asking.claim.kind === 'prazo' ? 'Recusar' : 'Não recebi'}
          onOk={() => void decide(asking.claim, false)}
        >
          {asking.claim.kind === 'prazo'
            ? `O link de ${asking.claim.label} vai mostrar que o novo prazo não foi aceito. Combine com a pessoa se quiser outra data.`
            : `O link de ${asking.claim.label} vai mostrar que o pagamento de ${money(asking.claim.amount)} não foi encontrado.`}
        </ConfirmDialog>
      )}
      <Modal open={!!photo} onClose={() => setPhoto(null)} title={photo ? `Comprovante · ${photo.label}` : 'Comprovante'}>
        <div className="px-5 py-4">
          {photo?.data ? (
            <img src={photo.data} alt={`Comprovante enviado por ${photo.label}`} className="max-h-[70dvh] w-full rounded-md border border-border object-contain" />
          ) : (
            <p className="text-sm text-fg-muted">{photo ? 'Carregando…' : ''}</p>
          )}
        </div>
      </Modal>
    </section>
  )
}

/** as dívidas (para achar pagamentos com foto do Telegram que ainda não estão neste aparelho) */
function useDebtsForPhotos(): { debts: Debt[] } {
  const { result } = useAppData()
  return { debts: result?.data.debts ?? [] }
}

/**
 * Pagamentos que o bot lançou com foto (comprovante `rc-tg-<id da op>`): a foto fica no worker até alguém buscar.
 * Busca as que faltam neste aparelho e guarda no IndexedDB, como o app antigo (fetchMissingTgPhotos ~l.6406).
 */
function useTelegramPhotos(debts: Debt[]) {
  useEffect(() => {
    const cfg = readBotCfg()
    if (!cfg.url || !cfg.key) return
    const ids = new Set<string>()
    for (const d of debts) for (const p of d.payments || []) {
      const id = receiptIdOf(p)
      if (id && id.startsWith('rc-tg-')) ids.add(id)
    }
    if (!ids.size) return
    let alive = true
    void (async () => {
      const store = receiptStore()
      for (const id of ids) {
        if (!alive) return
        if (await store.get(id)) continue
        const data = await fetchTgPhoto(cfg, id.slice('rc-tg-'.length))
        if (data && alive) await store.put(id, data)
      }
    })()
    return () => {
      alive = false
    }
  }, [debts])
}

async function fetchTgPhoto(cfg: { url?: string; key?: string }, opId: string): Promise<string | null> {
  try {
    const r = await globalThis.fetch((cfg.url ?? '').trim().replace(/\/+$/, '') + '/api/photo/' + encodeURIComponent(opId), {
      headers: { Authorization: 'Bearer ' + (cfg.key ?? '') },
    })
    if (!r.ok) return null
    const j: unknown = await r.json()
    const data = j && typeof j === 'object' ? (j as { data?: unknown }).data : null
    return typeof data === 'string' && /^data:image\//.test(data) ? data : null
  } catch {
    return null
  }
}
