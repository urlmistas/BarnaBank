import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Fingerprint, Loader2, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LOCK_EVENT, checkPin, lockoutMs, readLock, shouldRelock, verifyBio, writeLock, type LockCfg } from '@/lib/lock'
import logoUrl from '@/assets/logo.png'
import { useAppData } from './data-context'

/**
 * Trava do app (Configurações → Dados e app → Bloqueio do app). Com o bloqueio ligado, o app abre trancado e tranca de novo
 * depois do tempo escolhido fora dele. Trancado, o conteúdo nem é montado: só a tela do PIN (ou da biometria).
 */
export function LockGate({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<LockCfg | null>(() => readLock())
  const [locked, setLocked] = useState(() => !!readLock())
  const hiddenAt = useRef<number | null>(null)
  const cfgRef = useRef(cfg)
  useEffect(() => {
    cfgRef.current = cfg
  }, [cfg])

  // ligar, mudar ou desligar o bloqueio nas Configurações: a sessão atual continua aberta
  useEffect(() => {
    const sync = () => {
      const c = readLock()
      setCfg(c)
      if (!c) setLocked(false)
    }
    globalThis.addEventListener(LOCK_EVENT, sync)
    return () => globalThis.removeEventListener(LOCK_EVENT, sync)
  }, [])

  // saiu do app (aba escondida, outro app): ao voltar, tranca se passou do tempo escolhido
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const c = cfgRef.current
      const at = hiddenAt.current
      hiddenAt.current = null
      if (c && at !== null && shouldRelock(at, Date.now(), c.after)) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const unlock = useCallback(() => setLocked(false), [])
  if (cfg && locked) return <LockScreen cfg={cfg} onUnlock={unlock} />
  return <>{children}</>
}

function LockScreen({ cfg, onUnlock }: { cfg: LockCfg; onUnlock: () => void }) {
  const { signOut } = useAppData()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [fails, setFails] = useState(0)
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [forgot, setForgot] = useState(false)
  const tried = useRef(false)

  const waitSec = Math.max(0, Math.ceil((until - now) / 1000))
  useEffect(() => {
    if (until <= Date.now()) return
    const t = window.setInterval(() => {
      setNow(Date.now())
      if (Date.now() >= until) window.clearInterval(t)
    }, 500)
    return () => window.clearInterval(t)
  }, [until])

  // auto = pedido ao abrir a tela: o Safari do iPhone só aceita o Face ID depois de um toque, então ali a falha é silenciosa
  const bio = useCallback(
    async (auto = false) => {
      if (!cfg.cred) return
      setBusy(true)
      if (await verifyBio(cfg.cred)) onUnlock()
      else if (!auto) setMsg('Não deu para usar a biometria. Digite o PIN.')
      setBusy(false)
    },
    [cfg.cred, onUnlock],
  )

  // com biometria cadastrada, já pede ao abrir (se o navegador recusar sem toque, o botão fica na tela)
  useEffect(() => {
    if (tried.current || !cfg.cred) return
    tried.current = true
    void bio(true)
  }, [cfg.cred, bio])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || waitSec > 0 || !pin) return
    setBusy(true)
    setMsg(null)
    if (await checkPin(cfg, pin)) {
      onUnlock()
      return
    }
    const n = fails + 1
    setFails(n)
    setPin('')
    const wait = lockoutMs(n)
    if (wait > 0) {
      setUntil(Date.now() + wait)
      setNow(Date.now())
      setMsg('PIN errado várias vezes. Espere para tentar de novo.')
    } else setMsg('PIN errado.')
    setBusy(false)
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 text-fg">
      <form onSubmit={submit} className="w-full max-w-xs text-center">
        <img src={logoUrl} alt="" className="mx-auto size-12" />
        <h1 className="mt-4 flex items-center justify-center gap-2 text-lg font-semibold">
          <LockKeyhole aria-hidden="true" className="size-4 text-fg-muted" />
          BarnaBank bloqueado
        </h1>
        <p className="mt-1 text-sm text-fg-muted">Digite o PIN para abrir.</p>

        <label htmlFor="lock-pin" className="sr-only">
          PIN
        </label>
        <Input
          id="lock-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          disabled={waitSec > 0}
          autoFocus
          className="mt-5 text-center text-lg tracking-[0.4em]"
        />
        <p role="alert" aria-live="assertive" className={msg || waitSec > 0 ? 'mt-2 text-xs text-neg' : 'hidden'}>
          {waitSec > 0 ? `${msg} ${waitSec}s` : msg}
        </p>

        <Button type="submit" className="mt-4 w-full" disabled={busy || waitSec > 0 || pin.length < 4}>
          {busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}
          Abrir
        </Button>
        {cfg.cred && (
          <Button type="button" variant="outline" className="mt-2 w-full" disabled={busy} onClick={() => void bio(false)}>
            <Fingerprint aria-hidden="true" />
            Usar biometria
          </Button>
        )}

        {forgot ? (
          <div className="mt-5 rounded-md border border-border bg-surface px-3 py-3 text-left text-xs text-fg-muted">
            <p>Para tirar o bloqueio, o app sai da sua conta e você entra de novo com e-mail e senha. Seus dados ficam guardados.</p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  writeLock(null)
                  signOut()
                }}
              >
                Sair e tirar o bloqueio
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setForgot(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setForgot(true)} className="mt-5 cursor-pointer text-xs text-fg-subtle underline underline-offset-2 hover:text-fg">
            Esqueci o PIN
          </button>
        )}
      </form>
    </main>
  )
}
