import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Cloud, CloudOff, Eye, EyeOff, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppData } from './data-context'

/** Botão do cabeçalho + janela da conta (login só para LER os dados da nuvem). */
export function AccountButton() {
  const { cloud } = useAppData()
  const ref = useRef<HTMLDialogElement>(null)
  const on = cloud.status !== 'off'
  const label = on ? `Conta: ${cloud.email || 'conectada'}` : 'Entrar na conta'
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={label} title={label} aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        {on ? <Cloud className={cn(cloud.status === 'error' && 'text-neg')} /> : <CloudOff />}
      </Button>
      <AccountDialog dialogRef={ref} />
    </>
  )
}

function fmtWhen(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function AccountDialog({ dialogRef }: { dialogRef: React.RefObject<HTMLDialogElement | null> }) {
  const { cloud, signIn, signOut, refreshCloud } = useAppData()
  const titleId = useId()
  const emailId = useId()
  const passId = useId()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const on = cloud.status !== 'off'

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
          {on ? 'Sua conta' : 'Entrar na sua conta'}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
          <X />
        </Button>
      </div>

      {on ? (
        <div className="px-5 py-4">
          <p className="text-sm">
            Conectado como <span className="font-medium">{cloud.email}</span>
          </p>
          <p role="status" className={cn('num mt-1 text-xs', cloud.status === 'error' ? 'text-neg' : 'text-fg-muted')}>
            {cloud.status === 'loading'
              ? 'Baixando os dados da conta…'
              : cloud.status === 'error'
                ? `${cloud.error} Mostrando os dados deste aparelho.`
                : cloud.empty
                  ? 'A conta ainda não tem dados. Mostrando os dados deste aparelho.'
                  : `Dados da conta salvos em ${fmtWhen(cloud.updatedAt)}.`}
          </p>
          <p className="mt-3 text-xs text-fg-subtle">
            Este app só lê a sua conta: nada é alterado nela. Para editar, use o BarnaBank atual e depois toque em Atualizar.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={cloud.status === 'loading'} onClick={refreshCloud}>
              <RefreshCw aria-hidden="true" className={cn(cloud.status === 'loading' && 'motion-safe:animate-spin')} />
              Atualizar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                signOut()
                dialogRef.current?.close()
              }}
            >
              Sair deste app
            </Button>
          </div>
          <p className="mt-2 text-xs text-fg-subtle">Sair aqui não desconecta o BarnaBank atual.</p>
        </div>
      ) : (
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
            {busy ? 'Entrando…' : 'Entrar'}
          </Button>
          <p className="mt-3 text-xs text-fg-subtle">Criar conta ou recuperar a senha: no BarnaBank atual.</p>
        </form>
      )}
    </dialog>
  )
}
