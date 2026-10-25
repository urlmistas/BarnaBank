import { useEffect, useId, useState, type FormEvent } from 'react'
import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isEmail, PW_RULES, pwMissing, requestRecovery, signUp, updatePassword } from '@/lib/auth'
import { loginFromLink, type AuthLink } from '@/lib/auth-link'
import { cloudErrorText } from '@/lib/cloud'
import { cn } from '@/lib/utils'
import { useAppData } from './data-context'

/**
 * Janela da conta: entrar, criar conta, recuperar senha e "nova senha" (quando o usuário chega pelo link do e-mail).
 * Aberta por Configurações. Com `link` de recuperação, abre sozinha na tela de nova senha.
 */
type Mode = 'login' | 'signup' | 'reset' | 'recovery'
type Msg = { text: string; kind: 'err' | 'ok' } | null

const TITLE: Record<Mode, string> = { login: 'Entrar na sua conta', signup: 'Criar sua conta', reset: 'Recuperar senha', recovery: 'Nova senha' }
const SUBMIT: Record<Mode, string> = { login: 'Entrar', signup: 'Criar conta', reset: 'Enviar link', recovery: 'Salvar nova senha' }
const BUSY: Record<Mode, string> = { login: 'Entrando…', signup: 'Criando…', reset: 'Enviando…', recovery: 'Salvando…' }

export function AccountDialog({
  dialogRef,
  link = null,
  onReload,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>
  link?: AuthLink | null
  onReload?: () => void
}) {
  const { cloud, signIn } = useAppData()
  const titleId = useId()
  const emailId = useId()
  const passId = useId()
  const rulesId = useId()
  const recovery = !!link && link.type === 'recovery' && !link.error
  const [mode, setMode] = useState<Mode>(recovery ? 'recovery' : 'login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(link?.error ? { text: link.error, kind: 'err' } : null)

  // chegou pelo link do e-mail: abre a janela já na tela certa
  useEffect(() => {
    if (link) dialogRef.current?.showModal?.()
  }, [link, dialogRef])

  // senha nunca fica guardada: some ao fechar a janela
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const onClose = () => {
      setPass('')
      setShow(false)
      setMsg(null)
      setMode(recovery ? 'recovery' : 'login')
    }
    d.addEventListener('close', onClose)
    return () => d.removeEventListener('close', onClose)
  }, [dialogRef, recovery])

  function go(next: Mode) {
    setMode(next)
    setMsg(null)
    setPass('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const f = globalThis.fetch.bind(globalThis)
    if (mode !== 'recovery' && !isEmail(email)) return setMsg({ text: 'Digite um e-mail válido.', kind: 'err' })
    if ((mode === 'signup' || mode === 'recovery') && pwMissing(pass).length) return setMsg({ text: 'A senha ainda não atende todas as regras acima.', kind: 'err' })
    if (mode === 'login' && !pass) return setMsg({ text: 'Digite sua senha.', kind: 'err' })
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const err = await signIn(email.trim(), pass)
        if (err) setMsg({ text: err, kind: 'err' })
        else {
          setPass('')
          dialogRef.current?.close()
        }
      } else if (mode === 'signup') {
        const { session } = await signUp(f, email.trim(), pass)
        if (session) {
          // projeto sem confirmação de e-mail: já entra
          const err = await signIn(email.trim(), pass)
          if (err) setMsg({ text: err, kind: 'err' })
          else dialogRef.current?.close()
        } else {
          setMode('login')
          setPass('')
          setMsg({ text: `Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail, confirme e volte aqui para entrar.`, kind: 'ok' })
        }
      } else if (mode === 'reset') {
        await requestRecovery(f, email.trim())
        setMsg({ text: 'Se esse e-mail tem conta, enviamos um link para criar uma nova senha.', kind: 'ok' })
      } else if (link) {
        await updatePassword(f, link.accessToken, pass)
        setPass('')
        // senha trocada: entra com a sessão do link e recarrega para sincronizar
        await loginFromLink(f, link, onReload)
      }
    } catch (err) {
      setMsg({ text: cloudErrorText(err), kind: 'err' })
    } finally {
      setBusy(false)
    }
  }

  const pw = mode === 'signup' || mode === 'recovery'
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-fg backdrop:bg-black/50"
      onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {TITLE[mode]}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
          <X />
        </Button>
      </div>

      <form onSubmit={submit} className="px-5 py-4" noValidate>
        {(mode === 'login' || mode === 'signup') && (
          <div role="group" aria-label="Entrar ou criar conta" className="mb-4 grid grid-cols-2 gap-1 rounded-md border border-border p-1">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => go(m)}
                className={cn('h-8 cursor-pointer rounded-sm text-sm font-medium transition-colors', mode === m ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {m === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
            ))}
          </div>
        )}
        <p className="text-sm text-fg-muted">
          {mode === 'recovery'
            ? 'Escolha uma nova senha para a sua conta.'
            : mode === 'reset'
              ? 'Digite o e-mail da conta e enviaremos um link para criar uma nova senha.'
              : mode === 'signup'
                ? 'A conta guarda seus dados na nuvem para você usar em qualquer aparelho.'
                : 'Seus dados ficam neste aparelho e vão para a conta a cada alteração.'}
        </p>
        {mode === 'login' && cloud.error && !msg && <p className="mt-2 text-xs text-fg-muted">{cloud.error}</p>}

        {mode !== 'recovery' && (
          <>
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
              placeholder="voce@email.com"
              className="mt-1"
              autoFocus
            />
          </>
        )}

        {mode !== 'reset' && (
          <>
            <label htmlFor={passId} className="mt-3 block text-xs font-medium text-fg-muted">
              {mode === 'recovery' ? 'Nova senha' : 'Senha'}
            </label>
            <div className="relative mt-1">
              <Input
                id={passId}
                type={show ? 'text' : 'password'}
                autoComplete={pw ? 'new-password' : 'current-password'}
                placeholder={pw ? 'crie uma senha forte' : 'sua senha'}
                aria-describedby={pw ? rulesId : undefined}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="pr-10"
                autoFocus={mode === 'recovery'}
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
          </>
        )}

        {pw && (
          <ul id={rulesId} aria-label="Regras da senha" className="mt-2 grid gap-0.5 text-xs">
            {PW_RULES.map((r) => {
              const ok = r.test(pass)
              return (
                <li key={r.id} data-ok={ok} className={cn('flex items-center gap-1.5', ok ? 'text-pos' : 'text-fg-subtle')}>
                  <Check aria-hidden="true" className={cn('size-3.5', !ok && 'opacity-30')} />
                  {r.label}
                  <span className="sr-only">{ok ? ' (ok)' : ' (falta)'}</span>
                </li>
              )
            })}
          </ul>
        )}

        <p role="alert" aria-live="assertive" className={cn('mt-2 min-h-5 text-xs', msg?.kind === 'ok' ? 'text-pos' : 'text-neg')}>
          {msg?.text}
        </p>
        <Button type="submit" className="mt-2 w-full" disabled={busy}>
          {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          {busy ? BUSY[mode] : SUBMIT[mode]}
        </Button>
        {mode !== 'recovery' && (
          <Button type="button" variant="ghost" size="sm" className="mt-2 w-full" onClick={() => go(mode === 'reset' ? 'login' : 'reset')}>
            {mode === 'reset' ? 'Voltar' : 'Esqueci a senha'}
          </Button>
        )}
      </form>
    </dialog>
  )
}
