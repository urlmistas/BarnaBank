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
:root{--p-bg:#f7f7f5;--p-surface:#fff;--p-surface2:#f1f1ee;--p-border:#e3e3df;--p-border-strong:#cfcfca;--p-fg:#16171a;--p-muted:#565961;--p-subtle:#6a6d75;--p-accent-text:#7f6420;--p-pos:#1d7f53;--p-pos-bg:#e3f1ea;--p-warn-bg:#f4ecd6;--p-print-bg:#fff}
:root[data-theme=dark]{--p-bg:#0d0e10;--p-surface:#131417;--p-surface2:#191a1e;--p-border:#25272c;--p-border-strong:#34363c;--p-fg:#ededef;--p-muted:#a1a3aa;--p-subtle:#80838b;--p-accent-text:#d4b46a;--p-pos:#4cc38a;--p-pos-bg:#16271f;--p-warn-bg:#2a2414;--p-print-bg:#0d0e10}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:var(--p-bg)}
body{margin:0;background:var(--p-bg);font-family:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.45;color:var(--p-fg);padding:36px 18px;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-feature-settings:"cv11","ss01"}
h1,h2,h3,.geist{font-family:"Geist","Inter",system-ui,sans-serif;letter-spacing:-.02em}
.num,.tnum{font-family:"Geist","Inter",system-ui,sans-serif;font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}
.no-print{max-width:680px;margin:0 auto 18px;display:flex;justify-content:flex-end;gap:8px}
.no-print button{font:600 13px "Inter",system-ui,sans-serif;background:var(--p-fg);color:var(--p-bg);border:0;padding:10px 18px;border-radius:10px;cursor:pointer}
.no-print button.alt{background:transparent;color:var(--p-fg);border:1px solid var(--p-border-strong)}
@page{size:A4;margin:12mm}
@media print{.no-print{display:none}html,body{background:var(--p-print-bg)}body{padding:0}}
`

export interface PrintDoc {
  title: string
  css: string
  body: string
  /** nome sugerido para salvar (alguns navegadores usam o título da página) */
  lang?: string
  /** tema da folha (padrão: escuro, como o site) */
  theme?: 'dark' | 'light'
  /** false: o documento tem um visual só e não mostra o botão de trocar o tema */
  themable?: boolean
}

const PRINT_BTN =
  `<button type="button" onclick="(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){window.print()})">Imprimir / Salvar como PDF</button>`
const THEME_BTN =
  `<button type="button" class="alt" onclick="var r=document.documentElement;r.setAttribute('data-theme',r.getAttribute('data-theme')==='dark'?'light':'dark')">Claro / Escuro</button>`

/** HTML completo; os botões só aparecem na tela */
export function renderDoc(doc: PrintDoc): string {
  return (
    `<!DOCTYPE html><html lang="${doc.lang ?? 'pt-BR'}" data-theme="${doc.theme === 'light' ? 'light' : 'dark'}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(doc.title)}</title><style>${fontFaces()}${BASE_CSS}${doc.css}</style></head><body>` +
    `<div class="no-print">${doc.themable === false ? '' : THEME_BTN}${PRINT_BTN}</div>` +
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
