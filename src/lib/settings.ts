// Configurações que só servem para escrever dados (padrões ao criar dívida, Pix, carteira padrão, lembretes).
// Gravam em `barnabank_settings_v1`, a mesma chave do app antigo (DEFAULT_SETTINGS ~l.9, btnSettingsSave ~l.1810).
//
// Chaves (outros módulos leem estas, via `baseSettings` de useAppData()):
//   defaultRate, defaultLateFee, defaultLateInterest  número (% ao mês; multa e mora no máximo 100)
//   defaultWalletId                                   id da carteira ou ''
//   confirmDelete                                     pedir confirmação antes de excluir uma dívida (padrão true)
//   backupReminder                                    lembrar de exportar backup (padrão true)
//   pixKey, pixType, ownerName, ownerCity             Pix e nome que aparecem nas cobranças e nos links

export const PIX_TYPES = [
  { value: 'auto', label: 'Detectar sozinho' },
  { value: 'cpf', label: 'CPF' },
  { value: 'phone', label: 'Celular' },
  { value: 'email', label: 'E-mail' },
  { value: 'evp', label: 'Aleatória' },
] as const
export type PixType = (typeof PIX_TYPES)[number]['value']

export const PIX_KEY_MAX = 120
export const OWNER_CITY_MAX = 15
export const OWNER_NAME_MAX = 40

/** "1,5" e "1.5" valem; vazio ou inválido vira 0 */
export function parsePercent(text: string, max = Infinity): number {
  const n = parseFloat(String(text).trim().replace(',', '.'))
  if (isNaN(n) || n < 0) return 0
  return Math.min(n, max)
}

export interface DefaultsForm {
  defaultRate: string
  defaultLateFee: string
  defaultLateInterest: string
  defaultWalletId: string
}

/** mesmos limites do antigo: juros ≥ 0; multa e mora de 0 a 100 */
export function defaultsPatch(f: DefaultsForm, walletIds: string[]): Record<string, unknown> {
  return {
    defaultRate: parsePercent(f.defaultRate),
    defaultLateFee: parsePercent(f.defaultLateFee, 100),
    defaultLateInterest: parsePercent(f.defaultLateInterest, 100),
    // carteira que não existe mais volta a "nenhuma"
    defaultWalletId: walletIds.includes(f.defaultWalletId) ? f.defaultWalletId : '',
  }
}

export interface PixForm {
  pixKey: string
  pixType: string
  ownerName: string
  ownerCity: string
}

export function pixPatch(f: PixForm): Record<string, unknown> {
  return {
    pixKey: f.pixKey.trim().slice(0, PIX_KEY_MAX),
    pixType: PIX_TYPES.some((t) => t.value === f.pixType) ? f.pixType : 'auto',
    ownerName: f.ownerName.trim().slice(0, OWNER_NAME_MAX),
    ownerCity: f.ownerCity.trim().slice(0, OWNER_CITY_MAX),
  }
}

/** "" mostra o campo vazio quando o valor é 0 (como o antigo: placeholder "0") */
export const numText = (v: unknown): string => (typeof v === 'number' && v > 0 ? String(v) : '')
export const strText = (v: unknown): string => (typeof v === 'string' ? v : '')
