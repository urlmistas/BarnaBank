import { useEffect, useId, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { LOCK_AFTER, LOCK_EVENT, bioSupported, makeLock, readLock, registerBio, validPin, writeLock, type LockAfter, type LockCfg } from '@/lib/lock'
import { Row, Section, Switch } from './layout'

/** Bloqueio do app: PIN (e biometria do aparelho, se houver). Trava de conveniência: não criptografa os dados. */
export function LockSection() {
  const toast = useToast()
  const [cfg, setCfg] = useState<LockCfg | null>(() => readLock())
  const [bio, setBio] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pinDlg, setPinDlg] = useState(false)

  useEffect(() => {
    const sync = () => setCfg(readLock())
    globalThis.addEventListener(LOCK_EVENT, sync)
    void bioSupported().then(setBio)
    return () => globalThis.removeEventListener(LOCK_EVENT, sync)
  }, [])

  async function toggleBio(on: boolean) {
    if (!cfg) return
    setBusy(true)
    try {
      if (on) writeLock({ ...cfg, cred: await registerBio() })
      else writeLock({ salt: cfg.salt, hash: cfg.hash, after: cfg.after })
    } catch {
      toast.show('Não consegui cadastrar a biometria. O PIN continua valendo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title="Bloqueio do app"
      hint="Pede um PIN para abrir o BarnaBank neste aparelho. Protege contra quem pegar o seu celular; não criptografa os dados guardados nele."
    >
      <Row label="Bloquear com PIN" hint={cfg ? 'O app abre trancado e tranca de novo depois do tempo escolhido.' : 'Escolha um PIN de 4 a 8 números.'}>
        <Switch
          label="Bloquear com PIN"
          checked={!!cfg}
          onChange={(on) => {
            if (on) setPinDlg(true)
            else {
              writeLock(null)
              toast.show('Bloqueio desligado.')
            }
          }}
        />
      </Row>
      {cfg && (
        <>
          <Row label="Trancar de novo" hint="Quanto tempo fora do app até pedir o PIN outra vez.">
            <Select
              aria-label="Trancar de novo"
              value={String(cfg.after)}
              onChange={(v) => writeLock({ ...cfg, after: Number(v) as LockAfter })}
              options={LOCK_AFTER.map((o) => ({ value: String(o.value), label: o.label }))}
              className="sm:w-60"
            />
          </Row>
          {bio && (
            <Row label="Usar biometria" hint="Digital ou rosto do aparelho no lugar do PIN. O PIN continua como reserva.">
              <Switch label="Usar biometria" checked={!!cfg.cred} disabled={busy} onChange={(on) => void toggleBio(on)} />
            </Row>
          )}
          <Row label="Trocar o PIN">
            <Button size="sm" variant="outline" onClick={() => setPinDlg(true)}>
              Trocar PIN
            </Button>
          </Row>
        </>
      )}
      <Modal open={pinDlg} onClose={() => setPinDlg(false)} title={cfg ? 'Trocar o PIN' : 'Criar o PIN'}>
        <PinForm
          onCancel={() => setPinDlg(false)}
          onSave={async (pin) => {
            writeLock(await makeLock(pin, cfg?.after ?? 0, cfg?.cred))
            setPinDlg(false)
            toast.show(cfg ? 'PIN trocado.' : 'Bloqueio ligado. O app pede o PIN da próxima vez que você abrir.')
          }}
        />
      </Modal>
    </Section>
  )
}

function PinForm({ onSave, onCancel }: { onSave: (pin: string) => Promise<void>; onCancel: () => void }) {
  const a = useId()
  const b = useId()
  const [pin, setPin] = useState('')
  const [again, setAgain] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 8)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validPin(pin)) return setErr('O PIN tem de 4 a 8 números.')
    if (pin !== again) return setErr('Os dois PINs não são iguais.')
    setBusy(true)
    try {
      await onSave(pin)
    } catch {
      setErr('Não consegui salvar o PIN.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="px-5 py-4">
      <Field label="PIN (4 a 8 números)" htmlFor={a}>
        <Input id={a} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(digits(e.target.value))} autoFocus />
      </Field>
      <Field label="Repita o PIN" htmlFor={b} className="mt-3">
        <Input id={b} type="password" inputMode="numeric" autoComplete="off" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
      </Field>
      <p role="alert" className={err ? 'mt-3 text-sm text-neg' : 'hidden'}>
        {err}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          Salvar PIN
        </Button>
      </div>
    </form>
  )
}
