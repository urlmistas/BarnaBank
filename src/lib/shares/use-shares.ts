import { useEffect, useState } from 'react'
import { STORAGE_KEY } from '@/lib/storage'
import { STORE_EVENT } from '@/lib/store'
import { readBotCfg, type BotCfg } from '@/lib/sync/worker'
import { readShares, type Shares } from './shares'

// Os links ficam em `shares` no JSON cru do armazenamento (o app novo ainda não os carrega em AppData).
// Este hook lê de lá e relê quando este app grava (STORE_EVENT) ou outra aba mexe nos dados.

function readRawShares(): Shares {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || '{}')
    return readShares(raw && typeof raw === 'object' ? (raw as { shares?: unknown }).shares : null)
  } catch {
    return {}
  }
}

export function useShares(): Shares {
  const [shares, setShares] = useState<Shares>(readRawShares)
  useEffect(() => {
    const on = (e?: Event) => {
      if (e instanceof StorageEvent && e.key !== null && e.key !== STORAGE_KEY) return
      setShares(readRawShares())
    }
    window.addEventListener(STORE_EVENT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(STORE_EVENT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return shares
}

/** endereço e chave do bot guardados neste aparelho (a chave nunca é exibida) */
export function useBotCfg(): BotCfg {
  const [cfg, setCfg] = useState<BotCfg>(readBotCfg)
  useEffect(() => {
    const on = () => setCfg(readBotCfg())
    window.addEventListener('storage', on)
    window.addEventListener('focus', on)
    return () => {
      window.removeEventListener('storage', on)
      window.removeEventListener('focus', on)
    }
  }, [])
  return cfg
}
