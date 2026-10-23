import { CloudError, sbFetch, validSession, type CloudSession, type Fetch } from '@/lib/cloud'
import { applySnapshot, buildSnapshot, isLocalEmpty, localHash, snapshotHasData } from './snapshot'

// Sincronização dos dados deste aparelho com a conta (Supabase, tabela bb_user_state).
// Portada de sbPull/sbPush/sbSync do app antigo (app.js ~l.8395-8470):
// - os dados do aparelho são a fonte; a conta recebe cópias e só aceita se não mudou em outro aparelho
//   desde a última leitura (PATCH condicionado a `updated_at = rev`);
// - `rev` (updated_at da linha) e `synced` (hash dos dados locais) ficam na sessão (`bbweb_session`).

export interface SbRow {
  data: Record<string, unknown>
  updated_at: string
}

export interface SyncEnv {
  fetcher: Fetch
  /** sessão atual (lida a cada chamada: pode ter sido renovada ou apagada) */
  session: () => CloudSession | null
  /** grava a sessão (renovada, com rev/synced novos) ou null para sair */
  save: (s: CloudSession | null) => void
  now?: () => Date
}

export type SbResult =
  | { kind: 'noop' }
  | { kind: 'pushed' }
  | { kind: 'adopted' }
  /** os dois lados mudaram: a pessoa escolhe qual manter (resolveConflict) */
  | { kind: 'conflict'; row: SbRow }
  /** sem sessão */
  | { kind: 'off' }

const now = (env: SyncEnv) => (env.now ? env.now() : new Date())

/** sessão com token válido; se renovou, já grava (o refresh token antigo deixa de valer) */
async function active(env: SyncEnv): Promise<CloudSession> {
  const s0 = env.session()
  if (!s0) throw new CloudError('Sem login', 401)
  const s = await validSession(env.fetcher, s0, now(env).getTime())
  if (s !== s0) env.save(s)
  return s
}

function mark(env: SyncEnv, rev?: string) {
  const s = env.session()
  if (!s) return
  env.save({ ...s, synced: localHash(), ...(rev ? { rev } : {}) })
}

export async function sbPull(env: SyncEnv): Promise<SbRow | null> {
  const s = await active(env)
  const rows = await sbFetch<SbRow[]>(
    env.fetcher,
    '/rest/v1/bb_user_state?select=data,updated_at&user_id=eq.' + encodeURIComponent(s.uid),
    { method: 'GET' },
    s.access,
  )
  return rows?.[0] ?? null
}

/** sobe a foto atual. 'conflict' = a conta mudou em outro aparelho desde `rev` (ou a linha já existia sem rev) */
async function push(env: SyncEnv): Promise<'ok' | 'conflict'> {
  const s = await active(env)
  const snapshot = buildSnapshot(now(env))
  const hashAtBuild = localHash()
  const stamp = now(env).toISOString()
  let row: SbRow | undefined
  if (s.rev) {
    const rows = await sbFetch<SbRow[]>(
      env.fetcher,
      '/rest/v1/bb_user_state?user_id=eq.' + encodeURIComponent(s.uid) + '&updated_at=eq.' + encodeURIComponent(s.rev),
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ data: snapshot, updated_at: stamp }) },
      s.access,
    )
    if (!rows?.length) return 'conflict'
    row = rows[0]
  } else {
    try {
      const rows = await sbFetch<SbRow[]>(
        env.fetcher,
        '/rest/v1/bb_user_state',
        { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: s.uid, data: snapshot, updated_at: stamp }) },
        s.access,
      )
      row = rows?.[0]
    } catch (e) {
      // a linha já existe e este aparelho não sabia: é uma divergência, não um erro
      if ((e as CloudError).status === 409) return 'conflict'
      throw e
    }
  }
  const cur = env.session()
  // `synced` é o hash do que foi enviado (se o usuário mexeu durante o envio, a próxima sincronização manda de novo)
  if (cur) env.save({ ...cur, synced: hashAtBuild, ...(row?.updated_at ? { rev: row.updated_at } : {}) })
  return 'ok'
}

/** adota a linha da conta como dados deste aparelho (com cópia de segurança do que havia) */
function adopt(env: SyncEnv, row: SbRow): boolean {
  if (!applySnapshot(row.data, now(env))) return false
  mark(env, row.updated_at)
  return true
}

/**
 * Compara aparelho e conta e faz o que for preciso. Lança CloudError (rede, 401…): quem chama decide.
 * `initial`: primeira sincronização depois de entrar ou abrir o app.
 */
export async function sbSync(env: SyncEnv, opts: { initial?: boolean; retried?: boolean } = {}): Promise<SbResult> {
  if (!env.session()) return { kind: 'off' }
  const row = await sbPull(env)
  const s = env.session()
  if (!s) return { kind: 'off' }
  const localChanged = !s.synced || localHash() !== s.synced

  if (!row || !snapshotHasData(row.data)) {
    if (!isLocalEmpty() || opts.initial) return (await push(env)) === 'ok' ? { kind: 'pushed' } : retry(env, opts)
    return { kind: 'noop' }
  }
  if (row.updated_at === s.rev) {
    if (!localChanged) return { kind: 'noop' }
    // a conta está como eu a deixei e só este aparelho mudou: é só enviar
    return (await push(env)) === 'ok' ? { kind: 'pushed' } : retry(env, opts)
  }
  if (!localChanged || isLocalEmpty()) return adopt(env, row) ? { kind: 'adopted' } : { kind: 'noop' }
  return { kind: 'conflict', row }
}

/** o envio bateu numa mudança de outro aparelho: esquece o rev e relê (uma vez só) */
async function retry(env: SyncEnv, opts: { initial?: boolean; retried?: boolean }): Promise<SbResult> {
  if (opts.retried) return { kind: 'noop' }
  const s = env.session()
  if (s) {
    const { rev: _rev, ...rest } = s
    void _rev
    env.save(rest)
  }
  return sbSync(env, { ...opts, retried: true })
}

/** resposta da pessoa ao "Qual versão manter?" */
export async function sbResolve(env: SyncEnv, row: SbRow, useCloud: boolean): Promise<SbResult> {
  if (useCloud) return adopt(env, row) ? { kind: 'adopted' } : { kind: 'noop' }
  const s = env.session()
  if (!s) return { kind: 'off' }
  // mantém o do aparelho: passa a tratar a versão da conta como a "última lida" e sobe por cima
  env.save({ ...s, rev: row.updated_at })
  return (await push(env)) === 'ok' ? { kind: 'pushed' } : { kind: 'noop' }
}

/** envia só se algo mudou aqui desde a última sincronização (usado depois de cada gravação) */
export async function sbPushIfChanged(env: SyncEnv): Promise<SbResult> {
  const s = env.session()
  if (!s) return { kind: 'off' }
  if (s.synced && s.synced === localHash()) return { kind: 'noop' }
  // ainda não sincronizou nesta sessão: a sincronização completa decide (pode haver conflito)
  if (!s.synced) return sbSync(env)
  return (await push(env)) === 'ok' ? { kind: 'pushed' } : retry(env, {})
}
