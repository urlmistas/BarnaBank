import type { Contact } from '@/lib/types'

// Foto de perfil: reduzida no navegador (quadrada, ~160 px) e guardada como texto (data URL) no próprio contato,
// junto com telefone, etiquetas e notas. Vai na mesma linha que já é sincronizada com a conta: nada de arquivo à parte.

/** limite do texto da foto (uns 45 KB de imagem): foto maior que isso é recusada */
export const MAX_PHOTO_CHARS = 60000
export const PHOTO_SIZE = 160

/** a foto do contato, ou '' se não tem (ou se o valor guardado não é uma imagem) */
export function photoOf(c: Contact | undefined): string {
  const p = c?.photo
  return typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length <= MAX_PHOTO_CHARS ? p : ''
}

/** contato novo com a foto trocada ('' ou inválida = sem foto); o resto fica como está */
export function withPhoto(c: Contact | undefined, photo: string): Contact {
  const out: Contact = { ...(c ?? { phone: '' }) }
  const ok = /^data:image\/(jpeg|png|webp);base64,/.test(photo) && photo.length <= MAX_PHOTO_CHARS
  if (ok) out.photo = photo
  else delete out.photo
  return out
}

/** arquivo de imagem → foto quadrada (recorte central) em JPEG. Só no navegador. Lança Error com a mensagem para o usuário. */
export async function fileToPhoto(file: File, size = PHOTO_SIZE): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).')
  if (file.size > 15 * 1024 * 1024) throw new Error('Imagem grande demais (máximo 15 MB).')
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error('Não consegui abrir essa imagem.')
  }
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador não consegue reduzir a imagem.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  bmp.close?.()
  // qualidade cai até caber no limite
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q)
    if (url.length <= MAX_PHOTO_CHARS) return url
  }
  throw new Error('Não consegui deixar essa imagem pequena o bastante. Tente outra.')
}
