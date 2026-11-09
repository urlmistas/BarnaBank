// Sacudir o celular: pelo sensor de movimento. Duas "batidas" fortes em menos de 1 segundo contam como uma sacudida.
// No iPhone o sensor só liga depois de a pessoa permitir (toque num botão), então a permissão é pedida ao ligar a opção.

export const SHAKE_KEY = 'bbweb_shake'
/** avisa o app quando a opção é ligada ou desligada nas Configurações */
export const SHAKE_EVENT = 'bbweb:shake'

/** aceleração (m/s², sem a gravidade) a partir da qual um movimento conta como batida */
export const PEAK = 18
const WINDOW_MS = 1000
const COOLDOWN_MS = 2000

/** detector: alimente com a aceleração de cada leitura; devolve true na sacudida */
export function makeShakeDetector(now: () => number = () => Date.now()) {
  let peaks: number[] = []
  let last = -Infinity
  let hot = false
  return (accel: number): boolean => {
    const t = now()
    if (t - last < COOLDOWN_MS) return false
    const strong = accel >= PEAK
    // uma batida = subiu acima do limite (não conta várias leituras seguidas da mesma batida)
    if (strong && !hot) {
      peaks = peaks.filter((p) => t - p <= WINDOW_MS)
      peaks.push(t)
      hot = true
      if (peaks.length >= 2) {
        peaks = []
        last = t
        return true
      }
    } else if (!strong) hot = false
    return false
  }
}

/** módulo da aceleração de um DeviceMotionEvent, sem a gravidade quando o aparelho a separa */
export function accelOf(e: Pick<DeviceMotionEvent, 'acceleration' | 'accelerationIncludingGravity'>): number {
  const a = e.acceleration
  if (a && (a.x !== null || a.y !== null || a.z !== null)) return Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0)
  const g = e.accelerationIncludingGravity
  if (!g) return 0
  return Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81)
}

export function readShake(s: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return s?.getItem(SHAKE_KEY) === '1'
  } catch {
    return false
  }
}
export function writeShake(on: boolean, s: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    s?.setItem(SHAKE_KEY, on ? '1' : '0')
  } catch {
    /* sem storage */
  }
  globalThis.dispatchEvent?.(new Event(SHAKE_EVENT))
}

type MotionCtor = { requestPermission?: () => Promise<'granted' | 'denied'> }

/** o aparelho tem sensor de movimento? */
export const shakeSupported = (): boolean => typeof window !== 'undefined' && 'DeviceMotionEvent' in window

/** pede a permissão do sensor (iPhone); outros navegadores já deixam. Chame de um toque. */
export async function askShakePermission(): Promise<boolean> {
  if (!shakeSupported()) return false
  const ctor = (window as unknown as { DeviceMotionEvent: MotionCtor }).DeviceMotionEvent
  if (typeof ctor.requestPermission !== 'function') return true
  try {
    return (await ctor.requestPermission()) === 'granted'
  } catch {
    return false
  }
}
