import { call, readBotCfg, type BotEnv } from './worker'

// Notificação no aparelho (Web Push): o bot tem a chave pública (/api/push), este aparelho se inscreve e o bot manda
// os avisos (pagamento recebido, resumo do dia) mesmo com o app fechado. O service worker (public/sw.js) mostra o aviso.

export class PushError extends Error {}

export interface PushInfo {
  /** chave pública VAPID do bot (base64url) */
  key: string
  /** aparelhos inscritos nesta conta */
  devices: number
}

export const pushSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** base64url → bytes (o formato que o navegador pede em applicationServerKey) */
export function keyBytes(b64u: string): Uint8Array<ArrayBuffer> {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4))
  const out = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const path = '/api/push'
export const getPushInfo = (env: BotEnv) => call<PushInfo>(env, readBotCfg(), 'GET', undefined, path)

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new PushError('Disponível só no site instalado ou publicado (o app precisa do service worker).')
  return reg
}

/** este aparelho já está inscrito? */
export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    return !!(reg && (await reg.pushManager.getSubscription()))
  } catch {
    return false
  }
}

export async function enablePush(env: BotEnv): Promise<void> {
  if (!pushSupported()) throw new PushError('Este navegador não suporta notificações.')
  const reg = await registration()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new PushError('Notificações bloqueadas. Libere nas configurações do navegador para este site.')
  const { key } = await getPushInfo(env)
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
  await call(env, readBotCfg(), 'POST', { subscription: sub.toJSON() }, path)
}

export async function disablePush(env: BotEnv): Promise<void> {
  const reg = await registration()
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await call(env, readBotCfg(), 'DELETE', { endpoint: sub.endpoint }, path)
  await sub.unsubscribe()
}

/** manda uma notificação de teste para os aparelhos da conta; devolve quantos receberam */
export async function testPush(env: BotEnv): Promise<number> {
  const r = await call<{ sent?: number }>(env, readBotCfg(), 'POST', { test: true }, path)
  return r.sent ?? 0
}
