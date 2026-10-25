// Documentos imprimíveis: páginas HTML geradas em memória, abertas em outra aba e impressas pelo navegador
// ("Salvar como PDF"). Sem dependência: nada de biblioteca de PDF.

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** escapa texto do usuário para entrar no HTML (nome, nota, observação…) */
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c])

import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'
import geistUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url'

// A janela do documento não herda as fontes do site: Inter (texto) e Geist (títulos e números) vêm do próprio build,
// com endereço completo, e o botão só imprime depois que elas carregaram (senão o PDF sai com a fonte do sistema).
const abs = (u: string) => (/^(https?:|data:)/.test(u) ? u : (globalThis.location?.origin ?? '') + u)

export const fontFaces = () =>
  `@font-face{font-family:"Inter";src:url(${abs(interUrl)}) format("woff2");font-weight:100 900;font-style:normal;font-display:block}` +
  `@font-face{font-family:"Geist";src:url(${abs(geistUrl)}) format("woff2");font-weight:100 900;font-style:normal;font-display:block}`

/**
 * Estilos comuns das folhas; cada documento acrescenta os seus. Cores sólidas, sem degradê, sombra, transparência
 * nem rotação: o navegador transforma esses efeitos em imagem ao gerar o PDF e o texto sai serrilhado.
 */
export const BASE_CSS = `
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#f7f7f5;font-family:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.45;color:#16171a;padding:36px 18px;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-feature-settings:"cv11","ss01"}
h1,h2,h3,.geist{font-family:"Geist","Inter",system-ui,sans-serif;letter-spacing:-.02em}
.num,.tnum{font-family:"Geist","Inter",system-ui,sans-serif;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.no-print{max-width:680px;margin:0 auto 18px;text-align:right}
.no-print button{font:600 13px "Inter",system-ui,sans-serif;background:#16171a;color:#f7f7f5;border:0;padding:10px 18px;border-radius:10px;cursor:pointer}
@page{size:A4;margin:12mm}
@media print{.no-print{display:none}body{background:#fff;padding:0}}
`

export interface PrintDoc {
  title: string
  css: string
  body: string
  /** nome sugerido para salvar (alguns navegadores usam o título da página) */
  lang?: string
}

/** HTML completo; o botão "Imprimir" só aparece na tela */
export function renderDoc(doc: PrintDoc): string {
  return (
    `<!DOCTYPE html><html lang="${doc.lang ?? 'pt-BR'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(doc.title)}</title><style>${fontFaces()}${BASE_CSS}${doc.css}</style></head><body>` +
    `<div class="no-print"><button type="button" onclick="(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){window.print()})">Imprimir / Salvar como PDF</button></div>` +
    `${doc.body}</body></html>`
  )
}

/** abre o documento em outra aba. Devolve false se o navegador bloqueou a janela */
export function openPrintWindow(html: string, open: typeof window.open = window.open.bind(window)): boolean {
  const win = open('', '_blank')
  if (!win) return false
  win.document.open()
  win.document.write(html)
  win.document.close()
  return true
}
