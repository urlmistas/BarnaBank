import { useEffect, useId, useState, type FormEvent } from 'react'
import { Eye, EyeOff, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppData } from './data-context'

/** Janela de login da conta (só para LER os dados da nuvem). Aberta por Configurações. */
export function AccountDialog({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const { cloud, signIn } = useAppData()
  const titleId = useId()
  const emailId = useId()
  const passId = useId()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // senha nunca fica guardada: some ao fechar a janela
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const onClose = () => {
      setPass('')
      setShow(false)
      setErr(null)
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [dialogRef])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Digite um e-mail válido.')
    if (!pass) return setErr('Digite sua senha.')
    setBusy(true)
    setErr(null)
    const msg = await signIn(email.trim(), pass)
    setBusy(false)
    if (msg) setErr(msg)
    else {
      setPass('')
      dialogRef.current?.close()
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-lg border border-border bg-surface p-0 text-fg backdrop:bg-black/50"
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          Entrar na sua conta
        </h2>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
          <X />
        </Button>
      </div>

      <form onSubmit={submit} className="px-5 py-4" noValidate>
        <p className="text-sm text-fg-muted">
          Use o mesmo e-mail e senha do BarnaBank. Este app só <span className="text-fg">lê</span> os dados da conta; nada é alterado nela.
        </p>
        {cloud.error && !err && <p className="mt-2 text-xs text-fg-muted">{cloud.error}</p>}
        <label htmlFor={emailId} className="mt-4 block text-xs font-medium text-fg-muted">
          E-mail
        </label>
        <Input
          id={emailId}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1"
          autoFocus
        />
        <label htmlFor={passId} className="mt-3 block text-xs font-medium text-fg-muted">
          Senha
        </label>
        <div className="relative mt-1">
          <Input
            id={passId}
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-pressed={show}
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-fg-subtle hover:text-fg"
          >
            {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
        <p role="alert" aria-live="assertive" className="mt-2 min-h-5 text-xs text-neg">
          {err}
        </p>
        <Button type="submit" className="mt-2 w-full" disabled={busy}>
          {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
        <p className="mt-3 text-xs text-fg-subtle">Criar conta ou recuperar a senha: no BarnaBank atual.</p>
      </form>
    </dialog>
  )
}
