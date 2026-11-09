// Gestos do app instalado no celular: arrastar da borda esquerda volta uma tela; puxar a tela para baixo no topo atualiza.
// Só vale no app instalado (tela cheia): no navegador o Safari e o Chrome já têm o próprio "voltar" e "puxar para atualizar".

/** o app (cartão do Mercado Pago, etc.) escuta este evento para buscar dados novos */
export const REFRESH_EVENT = 'bbweb:refresh'

export interface TouchPoint {
  x: number
  y: number
  /** ms (performance.now ou Date.now) */
  t: number
}

/** largura da faixa da borda esquerda onde o gesto de voltar pode começar */
export const EDGE_PX = 24
const BACK_MIN_DX = 70
const BACK_MAX_DY = 60
const BACK_MAX_MS = 800

/** arrastou da borda esquerda para a direita, rápido e mais na horizontal que na vertical */
export function isBackSwipe(start: TouchPoint, end: TouchPoint): boolean {
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  return start.x <= EDGE_PX && dx >= BACK_MIN_DX && dy <= BACK_MAX_DY && dx > dy * 1.5 && end.t - start.t <= BACK_MAX_MS
}

/** quanto o puxar para baixo precisa descer (px de dedo, já com a resistência aplicada) para valer */
export const PULL_THRESHOLD = 64
const PULL_MAX = 96

/** distância mostrada no indicador para `dy` px de dedo: metade do movimento, com teto */
export const pullDistance = (dy: number): number => (dy <= 0 ? 0 : Math.min(PULL_MAX, dy * 0.5))

/** o puxar conta quando o dedo desceu o bastante e foi mais na vertical que na horizontal */
export function isPullStart(dx: number, dy: number): boolean {
  return dy > 6 && Math.abs(dy) > Math.abs(dx) * 1.2
}

// ---------------------------------------------------------------- deslizar entre as abas

const TAB_MIN_DX = 90
const TAB_MAX_DY = 45
const TAB_MAX_MS = 600

/** arrastão rápido para o lado, longe da borda esquerda (que é o "voltar"): +1 = próxima aba (dedo foi para a esquerda), −1 = anterior, 0 = nada */
export function tabSwipe(start: TouchPoint, end: TouchPoint): -1 | 0 | 1 {
  if (start.x <= EDGE_PX) return 0
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  if (Math.abs(dx) < TAB_MIN_DX || dy > TAB_MAX_DY || Math.abs(dx) < dy * 2.5 || end.t - start.t > TAB_MAX_MS) return 0
  return dx < 0 ? 1 : -1
}

/** vizinha da aba atual na ordem do menu (sem dar a volta); null no começo e no fim */
export function neighborTab(paths: string[], current: string, dir: -1 | 1): string | null {
  const i = paths.indexOf(current)
  if (i < 0) return null
  return paths[i + dir] ?? null
}

/** quanto a tela acompanha o dedo no "voltar" (px): metade do arrasto, com teto, para dar a sensação de peso */
export const backFollow = (dx: number): number => (dx <= 0 ? 0 : Math.min(140, dx * 0.6))
/** a partir daqui, soltar o dedo volta uma tela */
export const BACK_COMMIT_DX = 70

// ---------------------------------------------------------------- preferência dos gestos de aba

export const TAB_GESTURE_KEY = 'bbweb_tab_swipe'

/** deslizar entre abas ligado? (padrão: ligado) */
export function readTabSwipe(s: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return s?.getItem(TAB_GESTURE_KEY) !== '0'
  } catch {
    return true
  }
}
export function writeTabSwipe(on: boolean, s: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    s?.setItem(TAB_GESTURE_KEY, on ? '1' : '0')
  } catch {
    /* sem storage: vale só até recarregar */
  }
}

const BACK_DRAG_MAX_DY = 60

/** soltou depois de arrastar da borda esquerda: vale mesmo devagar (a tela acompanha o dedo, então a pessoa vê o que faz) */
export function isBackDrag(start: TouchPoint, end: TouchPoint): boolean {
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  return start.x <= EDGE_PX && dx >= BACK_COMMIT_DX && dy <= BACK_DRAG_MAX_DY && dx > dy * 1.5
}

/** o toque começou dentro de algo que rola para o lado (tabela, carrossel)? Aí o arrasto é da rolagem, não troca de aba */
export function inHorizontalScroll(el: Element | null): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true
  }
  return false
}
