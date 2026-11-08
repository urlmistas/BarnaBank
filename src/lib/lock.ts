// Bloqueio do app (PIN e, se o aparelho tiver, biometria). É uma trava de CONVENIÊNCIA: impede que outra pessoa que pegou
// o seu celular abra o BarnaBank, mas não criptografa os dados guardados no navegador. O PIN fica só como hash (PBKDF2).
// A biometria usa a verificação do próprio aparelho (WebAuthn); nada disso vai para servidor.

export const LOCK_KEY = 'bbweb_lock'
/** avisa a tela de bloqueio (e as Configurações) quando o bloqueio é ligado, mudado ou desligado */
export const LOCK_EVENT = 'bbweb:lock'

/** minutos fora do app até pedir de novo: 0 = sempre que sair; -1 = só ao abrir o app */
export type LockAfter = 0 | 1 | 5 | 15 | -1
export const LOCK_AFTER: { value: LockAfter; label: string }[] = [
  { value: 0, label: 'Sempre que eu sair do app' },
  { value: 1, label: 'Depois de 1 minuto fora' },
  { value: 5, label: 'Depois de 5 minutos fora' },
  { value: 15, label: 'Depois de 15 minutos fora' },
  { value: -1, label: 'Só ao abrir o app' },
]

export interface LockCfg {
  /** sal do PIN (base64url) */
  salt: string
  /** PBKDF2-SHA256 do PIN (base64url) */
  hash: string
  after: LockAfter
  /** id da credencial de biometria (base64url); ausente = só PIN */
  cred?: string
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const store = (): Store | undefined => {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

const ITER = 120_000
const AFTERS = new Set<number>([0, 1, 5, 15, -1])

export const validPin = (pin: string) => /^\d{4,8}$/.test(pin)

const b64u = (bytes: ArrayBuffer | Uint8Array) => {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64u = (str: string): Uint8Array<ArrayBuffer> => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function readLock(s: Store | undefined = store()): LockCfg | null {
  try {
    const v: unknown = JSON.parse(s?.getItem(LOCK_KEY) || 'null')
    if (!v || typeof v !== 'object') return null
    const o = v as Record<string, unknown>
    if (typeof o.salt !== 'string' || typeof o.hash !== 'string' || !o.salt || !o.hash) return null
    return {
      salt: o.salt,
      hash: o.hash,
      after: typeof o.after === 'number' && AFTERS.has(o.after) ? (o.after as LockAfter) : 0,
      ...(typeof o.cred === 'string' && o.cred ? { cred: o.cred } : {}),
    }
  } catch {
    return null
  }
}

export function writeLock(cfg: LockCfg | null, s: Store | undefined = store()) {
  try {
    if (cfg) s?.setItem(LOCK_KEY, JSON.stringify(cfg))
    else s?.removeItem(LOCK_KEY)
  } catch {
    /* sem armazenamento: o bloqueio não é gravado */
  }
  globalThis.dispatchEvent?.(new Event(LOCK_EVENT))
}

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  return b64u(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256))
}

/** monta a configuração de um PIN novo (não grava) */
export async function makeLock(pin: string, after: LockAfter = 0, cred?: string): Promise<LockCfg> {
  if (!validPin(pin)) throw new Error('O PIN tem de 4 a 8 números.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { salt: b64u(salt), hash: await pbkdf2(pin, salt), after, ...(cred ? { cred } : {}) }
}

export async function checkPin(cfg: LockCfg, pin: string): Promise<boolean> {
  if (!validPin(pin)) return false
  const h = await pbkdf2(pin, unb64u(cfg.salt))
  // compara sem parar no primeiro byte diferente
  let diff = h.length ^ cfg.hash.length
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (cfg.hash.charCodeAt(i) || 0)
  return diff === 0
}

/** depois de quanto tempo fora o app tranca de novo? */
export function shouldRelock(hiddenAt: number, now: number, after: LockAfter): boolean {
  if (after < 0) return false
  return now - hiddenAt >= after * 60_000
}

/** espera obrigatória depois de errar o PIN várias vezes (ms): 5 erros = 30 s, dobrando, no máximo 10 min */
export function lockoutMs(failures: number): number {
  if (failures < 5) return 0
  return Math.min(10 * 60_000, 30_000 * 2 ** (failures - 5))
}

// ---------------------------------------------------------------- biometria (WebAuthn, só neste aparelho)

export async function bioSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials) return false
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

const challenge = () => crypto.getRandomValues(new Uint8Array(32))

/** cadastra a biometria do aparelho e devolve o id da credencial; lança erro se a pessoa cancelar */
export async function registerBio(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'BarnaBank' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'barnabank', displayName: 'BarnaBank' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('Biometria cancelada.')
  return b64u(cred.rawId)
}

/** pede a biometria do aparelho; true se a pessoa passou */
export async function verifyBio(credId: string): Promise<boolean> {
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: challenge(),
        allowCredentials: [{ type: 'public-key', id: unb64u(credId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return !!got
  } catch {
    return false
  }
}
