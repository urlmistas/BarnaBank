// Disjuntor das sincronizações automáticas: se os dados não param de ir e voltar (dois aparelhos disputando,
// por exemplo), pausa por alguns minutos em vez de ficar chamando a conta e o bot sem parar.
// Receber dados de fora pesa mais que enviar: uma troca normal é rara, um vai e vem não.

export interface Breaker {
  /** registra o que uma sincronização fez; devolve true quando este registro fez o disjuntor desarmar */
  record(kind: string): boolean
  paused(): boolean
  reset(): void
}

export function createBreaker({ limit = 30, windowMs = 60_000, pauseMs = 5 * 60_000, now = () => Date.now() } = {}): Breaker {
  let hits: { t: number; w: number }[] = []
  let until = 0
  return {
    record(kind) {
      const w = kind === 'adopted' ? 5 : kind === 'pushed' ? 1 : 0
      if (!w) return false
      const t = now()
      hits = hits.filter((h) => t - h.t < windowMs)
      hits.push({ t, w })
      if (hits.reduce((s, h) => s + h.w, 0) < limit) return false
      hits = []
      until = t + pauseMs
      return true
    },
    paused: () => now() < until,
    reset() {
      hits = []
      until = 0
    },
  }
}
