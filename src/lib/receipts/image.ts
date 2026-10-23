// Reduz a foto antes de guardar (compressImage ~l.5383 do app antigo): lado maior até 1200px, JPEG 72%.

export const MAX_SIDE = 1200
export const JPEG_QUALITY = 0.72

/** tamanho final mantendo a proporção; nunca aumenta */
export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** foto escolhida → data URL JPEG reduzida. Falha se o arquivo não for uma imagem que o navegador abre. */
export function compressImage(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const { w, h } = fitSize(img.naturalWidth, img.naturalHeight)
      const cv = document.createElement('canvas')
      cv.width = w
      cv.height = h
      const c = cv.getContext('2d')
      URL.revokeObjectURL(url)
      if (!c) return rej(new Error('canvas'))
      // fundo branco: PNG com transparência não vira preto
      c.fillStyle = '#fff'
      c.fillRect(0, 0, w, h)
      c.drawImage(img, 0, 0, w, h)
      res(cv.toDataURL('image/jpeg', JPEG_QUALITY))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rej(new Error('img'))
    }
    img.src = url
  })
}
