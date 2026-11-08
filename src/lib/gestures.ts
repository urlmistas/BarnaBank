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
