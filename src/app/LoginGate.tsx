import { useState, type FormEvent, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isEmail, requestRecovery } from '@/lib/auth'
import { peekAuthLink } from '@/lib/auth-link'
import { cloudErrorText } from '@/lib/cloud'
import { cn } from '@/lib/utils'
import { useAppData } from './data-context'

/**
 * Login obrigatório: sem sessão da conta, só aparece esta tela. Não há "criar conta" aqui (o app é de uso pessoal).
 * Quem chega pelo link de recuperação de senha passa direto: Configurações abre a tela de nova senha.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const { cloud, signIn } = useAppData()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(false)
  const [msg, setMsg] = useState<{ text: string; kind: 'err' | 'ok' } | null>(null)

  if (cloud.status !== 'off' || peekAuthLink()) return <>{children}</>

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!isEmail(email)) return setMsg({ text: 'Digite um e-mail válido.', kind: 'err' })
    if (!reset && !pass) return setMsg({ text: 'Digite sua senha.', kind: 'err' })
    setBusy(true)
    setMsg(null)
    try {
      if (reset) {
        await requestRecovery(globalThis.fetch.bind(globalThis), email.trim())
        setMsg({ text: 'Se esse e-mail tem conta, enviamos um link para criar uma nova senha.', kind: 'ok' })
      } else {
        const err = await signIn(email.trim(), pass)
        if (err) setMsg({ text: err, kind: 'err' })
        else setPass('')
      }
    } catch (err) {
      setMsg({ text: cloudErrorText(err), kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <form onSubmit={submit} noValidate className="w-full max-w-sm rounded-lg border border-border bg-surface p-5">
        <h1 className="text-lg font-semibold">{reset ? 'Recuperar senha' : 'Entrar no Barna Bank'}</h1>
        <p className="mt-1 text-sm text-fg-muted">{reset ? 'Enviaremos um link para criar uma nova senha.' : 'Entre com a sua conta para continuar.'}</p>

        <label htmlFor="gate-email" className="mt-4 block text-xs font-medium text-fg-muted">
          E-mail
        </label>
        <Input id="gate-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" autoFocus />

        {!reset && (
          <>
            <label htmlFor="gate-pass" className="mt-3 block text-xs font-medium text-fg-muted">
              Senha
            </label>
            <Input id="gate-pass" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} className="mt-1" />
          </>
        )}

        <p role="alert" aria-live="assertive" className={cn('mt-2 min-h-5 text-xs', msg?.kind === 'ok' ? 'text-pos' : 'text-neg')}>
          {msg ? msg.text : reset ? '' : cloud.error}
        </p>
        <Button type="submit" className="mt-2 w-full" disabled={busy}>
          {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          {reset ? 'Enviar link' : 'Entrar'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            setReset(!reset)
            setMsg(null)
            setPass('')
          }}
        >
          {reset ? 'Voltar' : 'Esqueci a senha'}
        </Button>
      </form>
    </main>
  )
}
