// Atalhos de teclado: lista única (usada pelo teclado e pela tela de Configurações) e a regra de qual tecla faz o quê.
// Chave própria `bbweb_shortcuts`: '0' desliga os atalhos de uma tecla. Ctrl/⌘+K e Esc valem sempre.

export const SHORTCUTS_KEY = 'bbweb_shortcuts'
export const CHORD_MS = 1200

export type ShortcutAction =
  | 'search'
  | 'simulator'
  | 'hide'
  | 'theme'
  | 'help'
  | { go: string }

export interface ShortcutInfo {
  id: string
  label: string
  /** cada item é uma tecla; ['G', 'P'] = G e depois P */
  keys: string[]
  /** teclas alternativas para a mesma ação */
  alt?: string[]
  group: 'geral' | 'ir'
  /** vale mesmo com os atalhos de uma tecla desligados */
  always?: boolean
}

export const GO_TARGETS: Record<string, { to: string; label: string }> = {
  i: { to: '/', label: 'Início' },
  p: { to: '/pessoas', label: 'Pessoas' },
  c: { to: '/carteiras', label: 'Carteiras' },
  o: { to: '/contas', label: 'Contas' },
  r: { to: '/relatorios', label: 'Relatórios' },
  ',': { to: '/configuracoes', label: 'Configurações' },
}

export const SHORTCUTS: ShortcutInfo[] = [
  { id: 'search', label: 'Buscar em tudo', keys: ['Ctrl', 'K'], alt: ['/'], group: 'geral', always: true },
  { id: 'simulator', label: 'Abrir o simulador', keys: ['S'], group: 'geral' },
  { id: 'hide', label: 'Esconder ou mostrar valores', keys: ['H'], group: 'geral' },
  { id: 'theme', label: 'Alternar claro e escuro', keys: ['T'], group: 'geral' },
  { id: 'help', label: 'Ver esta lista de atalhos', keys: ['?'], group: 'geral' },
  { id: 'close', label: 'Fechar a janela aberta', keys: ['Esc'], group: 'geral', always: true },
  ...Object.entries(GO_TARGETS).map(([k, t]): ShortcutInfo => ({ id: 'go-' + k, label: t.label, keys: ['G', k === ',' ? ',' : k.toUpperCase()], group: 'ir' })),
]

export function readShortcutsOn(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try {
    return storage?.getItem(SHORTCUTS_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeShortcutsOn(on: boolean, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(SHORTCUTS_KEY, on ? '1' : '0')
  } catch {
    /* sem storage: vale só até recarregar */
  }
}

export interface KeyInfo {
  key: string
  ctrl: boolean
  meta: boolean
  alt: boolean
  /** foco em campo de texto */
  typing: boolean
  /** há uma janela (dialog) aberta */
  dialogOpen: boolean
}

export interface KeyResult {
  /** ação a executar, se houver */
  action: ShortcutAction | null
  /** o G foi apertado e a próxima tecla escolhe a tela */
  chord: boolean
  /** quem chamou deve dar preventDefault */
  handled: boolean
}

const NONE: KeyResult = { action: null, chord: false, handled: false }

/**
 * `chord`: o G acabou de ser apertado (dentro de CHORD_MS). `on`: atalhos de uma tecla ligados.
 * Ctrl/⌘+K funciona sempre, exceto com janela aberta (a busca já abre sozinha por cima).
 */
export function resolveKey(e: KeyInfo, chord: boolean, on: boolean): KeyResult {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
  if (k === 'k' && (e.ctrl || e.meta) && !e.alt) return e.dialogOpen ? NONE : { action: 'search', chord: false, handled: true }
  if (e.ctrl || e.meta || e.alt || e.typing || e.dialogOpen) return NONE
  if (k === '/') return { action: 'search', chord: false, handled: true }
  if (!on) return NONE
  if (chord) {
    const t = GO_TARGETS[k]
    return t ? { action: { go: t.to }, chord: false, handled: true } : NONE
  }
  switch (k) {
    case 'g':
      return { action: null, chord: true, handled: true }
    case 's':
      return { action: 'simulator', chord: false, handled: true }
    case 'h':
      return { action: 'hide', chord: false, handled: true }
    case 't':
      return { action: 'theme', chord: false, handled: true }
    case '?':
      return { action: 'help', chord: false, handled: true }
    default:
      return NONE
  }
}
