import { useState } from 'react'
import { Save } from 'lucide-react'
import { useAppData } from '@/app/data-context'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { addDaysISO } from '@/lib/finance/dates'
import { backupReminder, exportBackup, readReminderState, snoozeBackupBanner } from './backup'

/**
 * Aviso "faz tempo sem backup" (checkBackupReminder do antigo). Aparece só com o lembrete ligado em Configurações.
 * Para usar: monte <BackupBanner /> no topo do conteúdo (AppShell).
 */
export function BackupBanner() {
  const { today, baseSettings, result } = useAppData()
  const toast = useToast()
  const [tick, setTick] = useState(0)
  void tick
  const msg = backupReminder({
    enabled: baseSettings.backupReminder !== false,
    debts: result?.source === 'local' ? (result.data.debts.length ?? 0) : 0,
    today,
    ...readReminderState(),
  })
  if (!msg) return null

  async function save() {
    try {
      await exportBackup(today)
      toast.show('Backup exportado em JSON')
    } catch {
      toast.show('Não consegui gerar o backup.')
    }
    setTick((t) => t + 1)
  }

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
      <span className="flex min-w-0 items-center gap-2 text-fg-muted">
        <Save aria-hidden="true" className="size-4 shrink-0" />
        {msg}
      </span>
      <span className="flex gap-1.5">
        <Button size="sm" onClick={save}>
          Exportar agora
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            snoozeBackupBanner(addDaysISO(today, 3))
            setTick((t) => t + 1)
          }}
        >
          Agora não
        </Button>
      </span>
    </div>
  )
}
