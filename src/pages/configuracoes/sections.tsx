import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { applyImport, exportBackup, hasBackupPrev, parseBackup, readReminderState, restoreBackupPrev, type ImportPlan } from '@/lib/backup/backup'
import { useInstall } from '@/lib/pwa/install'
import { defaultsPatch, numText, OWNER_CITY_MAX, OWNER_NAME_MAX, PIX_KEY_MAX, PIX_TYPES, pixPatch, strText } from '@/lib/settings'
import { commitSettings } from '@/lib/store'
import { Row, Section } from './layout'

// Seções de Configurações que gravam dados: padrões, Pix, backup e instalação.

const boolOn = (v: unknown) => v !== false

function CheckRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <Row label={label} hint={hint} htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer" />
    </Row>
  )
}

function useSave() {
  const toast = useToast()
  return (patch: Record<string, unknown>, ok = 'Configurações salvas') => {
    const r = commitSettings(patch)
    toast.show(r.ok ? ok : r.error)
    return r.ok
  }
}

// ---------------------------------------------------------------- padrões

export function DefaultsSection() {
  const { baseSettings } = useAppData()
  // recria o formulário quando os valores mudam por fora (importar backup, sincronizar)
  const key = [baseSettings.defaultRate, baseSettings.defaultLateFee, baseSettings.defaultLateInterest, baseSettings.defaultWalletId].join('|')
  return <DefaultsForm key={key} />
}

function DefaultsForm() {
  const { baseSettings, result } = useAppData()
  const save = useSave()
  const wallets = result?.data?.wallets ?? []
  const ids = { rate: useId(), fee: useId(), mora: useId(), wallet: useId() }
  const [rate, setRate] = useState(numText(baseSettings.defaultRate))
  const [fee, setFee] = useState(numText(baseSettings.defaultLateFee))
  const [mora, setMora] = useState(numText(baseSettings.defaultLateInterest))
  const [wallet, setWallet] = useState(strText(baseSettings.defaultWalletId))

  function submit(e: FormEvent) {
    e.preventDefault()
    const patch = defaultsPatch(
      { defaultRate: rate, defaultLateFee: fee, defaultLateInterest: mora, defaultWalletId: wallet },
      wallets.map((w) => w.id),
    )
    if (save(patch)) {
      setRate(numText(patch.defaultRate))
      setFee(numText(patch.defaultLateFee))
      setMora(numText(patch.defaultLateInterest))
      setWallet(String(patch.defaultWalletId))
    }
  }

  return (
    <Section title="Padrões">
      <form onSubmit={submit} className="px-4 py-3.5 sm:px-5" noValidate>
        <p className="text-xs text-fg-muted">Valores que já vêm preenchidos ao criar uma dívida e ao registrar um pagamento.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={ids.rate} className="block text-xs font-medium text-fg-muted">
              Juros (% ao mês)
            </label>
            <Input id={ids.rate} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" className="mt-1" />
          </div>
          <div>
            <label htmlFor={ids.fee} className="block text-xs font-medium text-fg-muted">
              Multa por atraso (%)
            </label>
            <Input id={ids.fee} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0 = sem multa" className="mt-1" />
          </div>
          <div>
            <label htmlFor={ids.mora} className="block text-xs font-medium text-fg-muted">
              Mora (% ao mês)
            </label>
            <Input id={ids.mora} inputMode="decimal" value={mora} onChange={(e) => setMora(e.target.value)} placeholder="0 = sem mora" className="mt-1" />
          </div>
        </div>
        <label htmlFor={ids.wallet} className="mt-3 block text-xs font-medium text-fg-muted">
          Carteira padrão dos pagamentos
        </label>
        <Select
          id={ids.wallet}
          value={wallet}
          onChange={setWallet}
          options={[{ value: '', label: '— nenhuma —' }, ...wallets.map((w) => ({ value: w.id, label: w.name }))]}
          className="mt-1 sm:w-72"
        />
        <Button type="submit" size="sm" className="mt-4">
          Salvar padrões
        </Button>
      </form>
      <CheckRow
        label="Confirmar antes de excluir"
        hint="Pede confirmação antes de excluir uma dívida."
        checked={boolOn(baseSettings.confirmDelete)}
        onChange={(v) => save({ confirmDelete: v })}
      />
      <CheckRow
        label="Lembrar de fazer backup"
        hint="Avisa quando passar duas semanas sem exportar."
        checked={boolOn(baseSettings.backupReminder)}
        onChange={(v) => save({ backupReminder: v })}
      />
    </Section>
  )
}

// ---------------------------------------------------------------- Pix

export function PixSection() {
  const { baseSettings } = useAppData()
  const key = [baseSettings.pixKey, baseSettings.pixType, baseSettings.ownerName, baseSettings.ownerCity].join('|')
  return <PixForm key={key} />
}

function PixForm() {
  const { baseSettings } = useAppData()
  const save = useSave()
  const ids = { key: useId(), type: useId(), name: useId(), city: useId() }
  const [pixKey, setPixKey] = useState(strText(baseSettings.pixKey))
  const [pixType, setPixType] = useState(strText(baseSettings.pixType) || 'auto')
  const [ownerName, setOwnerName] = useState(strText(baseSettings.ownerName))
  const [ownerCity, setOwnerCity] = useState(strText(baseSettings.ownerCity))

  function submit(e: FormEvent) {
    e.preventDefault()
    const patch = pixPatch({ pixKey, pixType, ownerName, ownerCity })
    if (save(patch, 'Pix salvo')) {
      setPixKey(String(patch.pixKey))
      setOwnerName(String(patch.ownerName))
      setOwnerCity(String(patch.ownerCity))
    }
  }

  return (
    <Section title="Pix">
      <form onSubmit={submit} className="px-4 py-3.5 sm:px-5" noValidate>
        <p className="text-xs text-fg-muted">A chave vai junto nas cobranças e gera o QR Code nos links de cobrança.</p>
        <label htmlFor={ids.key} className="mt-3 block text-xs font-medium text-fg-muted">
          Chave Pix
        </label>
        <Input
          id={ids.key}
          value={pixKey}
          maxLength={PIX_KEY_MAX}
          onChange={(e) => setPixKey(e.target.value)}
          placeholder="E-mail, celular, CPF ou chave aleatória"
          autoComplete="off"
          className="mt-1"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.type} className="block text-xs font-medium text-fg-muted">
              Tipo da chave
            </label>
            <Select id={ids.type} value={pixType} onChange={setPixType} options={PIX_TYPES.map((t) => ({ value: t.value, label: t.label }))} className="mt-1" />
          </div>
          <div>
            <label htmlFor={ids.city} className="block text-xs font-medium text-fg-muted">
              Sua cidade (vai no QR)
            </label>
            <Input id={ids.city} value={ownerCity} maxLength={OWNER_CITY_MAX} onChange={(e) => setOwnerCity(e.target.value)} placeholder="Ex: São Paulo" className="mt-1" />
          </div>
        </div>
        <label htmlFor={ids.name} className="mt-3 block text-xs font-medium text-fg-muted">
          Seu nome (aparece nos links e no Pix)
        </label>
        <Input id={ids.name} value={ownerName} maxLength={OWNER_NAME_MAX} onChange={(e) => setOwnerName(e.target.value)} placeholder="Ex: João" className="mt-1 sm:w-72" />
        <Button type="submit" size="sm" className="mt-4">
          Salvar Pix
        </Button>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------- backup

export function BackupSection() {
  const { today, date } = useAppData()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  void tick
  const last = readReminderState().lastExport

  async function doExport() {
    setBusy(true)
    try {
      await exportBackup(today)
      toast.show('Backup exportado em JSON')
    } catch {
      toast.show('Não consegui gerar o backup.')
    } finally {
      setBusy(false)
      setTick((t) => t + 1)
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const r = parseBackup(String(reader.result))
      if (r.ok) setPlan(r.plan)
      else setError(r.error)
    }
    reader.onerror = () => setError('Não consegui abrir esse arquivo.')
    reader.readAsText(file)
  }

  async function doImport() {
    if (!plan) return
    const p = plan
    setPlan(null)
    const photos = await applyImport(p)
    if (photos === null) return toast.show('Não consegui salvar o backup neste navegador. Nada foi alterado.')
    toast.show(p.skipped > 0 ? `Backup importado: ${p.skipped} registro(s) inválido(s) foram ignorados` : 'Backup importado com sucesso')
    setTick((t) => t + 1)
  }

  return (
    <Section title="Backup">
      <Row label="Exportar" hint={last ? `Último backup em ${date(last)}.` : 'Ainda não exportou. O arquivo leva dívidas, carteiras, contas, configurações e comprovantes.'}>
        <Button variant="outline" size="sm" disabled={busy} onClick={doExport}>
          {busy ? <Loader2 aria-hidden="true" className="motion-safe:animate-spin" /> : <Download aria-hidden="true" />}
          Exportar backup
        </Button>
      </Row>
      <Row label="Importar" hint="Troca os dados deste aparelho pelos do arquivo. Antes, guardamos uma cópia do que existia.">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden="true" />
          Importar backup
        </Button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} className="sr-only" tabIndex={-1} aria-label="Arquivo de backup" />
      </Row>
      {hasBackupPrev() && (
        <Row label="Voltar ao que havia antes" hint="Desfaz a última importação ou a última troca de dados pela versão da nuvem.">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              toast.show(restoreBackupPrev() ? 'Dados anteriores restaurados' : 'Não consegui restaurar.')
              setTick((t) => t + 1)
            }}
          >
            Restaurar
          </Button>
        </Row>
      )}

      <Modal open={!!plan} onClose={() => setPlan(null)} title="Importar backup?">
        {plan && (
          <div className="px-5 py-4">
            <p className="text-sm text-fg-muted">
              Importar este backup vai <b className="text-fg">substituir</b> os dados atuais:
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {plan.lines.map((l) => (
                <li key={l.label}>
                  {l.label}: {l.from} atuais → <b className="num">{l.to}</b> do arquivo
                </li>
              ))}
            </ul>
            {plan.skipped > 0 && <p className="mt-2 text-xs text-fg-muted">{plan.skipped} registro(s) inválido(s) serão ignorados.</p>}
            <p className="mt-2 text-xs text-fg-subtle">Dica: exporte um backup do estado atual antes, por segurança.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPlan(null)}>
                Cancelar
              </Button>
              <Button onClick={doImport}>Importar e substituir</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!error} onClose={() => setError(null)} title="Arquivo inválido">
        <div className="px-5 py-4">
          <p role="alert" className="text-sm text-fg-muted">
            {error}
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setError(null)}>Fechar</Button>
          </div>
        </div>
      </Modal>
    </Section>
  )
}

// ---------------------------------------------------------------- instalar

export function InstallSection() {
  const { canInstall, installed, install } = useInstall()
  return (
    <Section title="Aplicativo">
      <Row
        label="Instalar o BarnaBank"
        hint={
          installed
            ? 'Já está instalado neste aparelho.'
            : canInstall
              ? 'Abre em tela cheia, como um app, e abre rápido mesmo com a internet ruim.'
              : 'No celular, use "Adicionar à tela inicial" do navegador para abrir o BarnaBank como um app.'
        }
      >
        {canInstall && (
          <Button size="sm" onClick={() => void install()}>
            Instalar
          </Button>
        )}
      </Row>
    </Section>
  )
}
