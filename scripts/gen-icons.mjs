// Gera os ícones PNG do app a partir do desenho de public/favicon.svg (quadrado dourado com um "B"), sem dependências.
// Uso: node scripts/gen-icons.mjs   (grava em public/icons/)
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const GOLD = [0xd4, 0xb4, 0x6a]
const INK = [0x1a, 0x16, 0x08]

// o "B" em coordenadas de 0 a 1 (largura 0.72, altura 1): haste + duas barrigas, com um furo em cada
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r
function inB(x, y) {
  const top = inRect(x, y, 0, 0, 0.43, 0.54) || inCircle(x, y, 0.43, 0.27, 0.27)
  const bottom = inRect(x, y, 0, 0.46, 0.45, 1) || inCircle(x, y, 0.45, 0.73, 0.27)
  const holeTop = inRect(x, y, 0.24, 0.14, 0.43, 0.4) || inCircle(x, y, 0.43, 0.27, 0.13)
  const holeBottom = inRect(x, y, 0.24, 0.6, 0.45, 0.86) || inCircle(x, y, 0.45, 0.73, 0.13)
  return (top || bottom) && !holeTop && !holeBottom
}

/** quadrado arredondado (raio relativo) ou tela cheia (maskable) */
function inBackground(x, y, radius) {
  if (radius === 0) return true
  const cx = x < radius ? radius : x > 1 - radius ? 1 - radius : x
  const cy = y < radius ? radius : y > 1 - radius ? 1 - radius : y
  return inCircle(x, y, cx, cy, radius)
}

function render(size, { radius, glyphHeight }) {
  const SS = 4 // 4x4 amostras por pixel (borda suave)
  const gw = glyphHeight * 0.72
  const gx0 = 0.5 - gw / 2
  const gy0 = 0.5 - glyphHeight / 2
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0
    for (let px = 0; px < size; px++) {
      let bg = 0
      let ink = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          if (!inBackground(x, y, radius)) continue
          bg++
          if (inB((x - gx0) / gw, (y - gy0) / glyphHeight)) ink++
        }
      }
      const n = SS * SS
      const o = py * (size * 4 + 1) + 1 + px * 4
      const cover = bg / n
      const k = bg ? ink / bg : 0
      raw[o] = Math.round(GOLD[0] * (1 - k) + INK[0] * k)
      raw[o + 1] = Math.round(GOLD[1] * (1 - k) + INK[1] * k)
      raw[o + 2] = Math.round(GOLD[2] * (1 - k) + INK[2] * k)
      raw[o + 3] = Math.round(255 * cover)
    }
  }
  return png(size, size, raw)
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(w, h, raw) {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(w, 0)
  head.writeUInt32BE(h, 4)
  head[8] = 8 // 8 bits
  head[9] = 6 // RGBA
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const outDir = new URL('../public/icons/', import.meta.url)
mkdirSync(outDir, { recursive: true })
const R = 7 / 32 // o mesmo canto do favicon
const files = {
  'icon-192.png': render(192, { radius: R, glyphHeight: 0.56 }),
  'icon-512.png': render(512, { radius: R, glyphHeight: 0.56 }),
  // maskable: tela cheia; o "B" fica na zona segura (80% central)
  'maskable-512.png': render(512, { radius: 0, glyphHeight: 0.4 }),
  'apple-touch-icon.png': render(180, { radius: 0, glyphHeight: 0.46 }),
}
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(new URL(name, outDir), buf)
  console.log('ok', name, buf.length, 'bytes')
}
