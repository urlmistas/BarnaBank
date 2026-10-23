// Documentos imprimíveis: páginas HTML geradas em memória, abertas em outra aba e impressas pelo navegador
// ("Salvar como PDF"). Sem dependência: nada de biblioteca de PDF.

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

/** escapa texto do usuário para entrar no HTML (nome, nota, observação…) */
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c])

/** estilos comuns das folhas; cada documento acrescenta os seus */
export const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:#e9e4d6;font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#232418;padding:36px 18px}
.no-print{max-width:680px;margin:0 auto 18px;text-align:right}
.no-print button{font:600 13px Inter,system-ui,sans-serif;background:#232418;color:#fbf8f0;border:0;padding:10px 18px;border-radius:8px;cursor:pointer}
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
    `<title>${esc(doc.title)}</title><style>${BASE_CSS}${doc.css}</style></head><body>` +
    `<div class="no-print"><button type="button" onclick="window.print()">Imprimir / Salvar como PDF</button></div>` +
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
