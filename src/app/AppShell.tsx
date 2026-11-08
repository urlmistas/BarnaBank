import { useCallback, useState } from 'react'
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDown, Calculator, ChartColumn, Eye, EyeOff, House, Loader2, Receipt, Search, Settings, Users, Wallet, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import logoUrl from '@/assets/logo.png'
import { useTheme } from './theme'
import { useAppData } from './data-context'
import { SyncConflictDialog } from './SyncConflictDialog'
import { SearchDialog } from './SearchDialog'
import { SimulatorDialog } from './SimulatorDialog'
import { QuickAdd } from './QuickAdd'
import { useGestures } from './use-gestures'
import { useToast } from '@/components/ui/toast'
import { isStandalone } from '@/lib/pwa/install'
import { PULL_THRESHOLD, REFRESH_EVENT } from '@/lib/gestures'
import { useShortcuts } from './use-shortcuts'
import type { ShortcutAction } from '@/lib/shortcuts'

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Início', icon: House },
  { to: '/pessoas', label: 'Pessoas', icon: Users },
  { to: '/carteiras', label: 'Carteiras', icon: Wallet },
  { to: '/contas', label: 'Contas', icon: Receipt },
  { to: '/relatorios', label: 'Relatórios', icon: ChartColumn },
]

const ease = [0.2, 0, 0, 1] as const

function Underline({ id, className = 'inset-x-0 h-0.5' }: { id: string; className?: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden="true"
      className={cn('absolute -bottom-px rounded-full bg-accent', className)}
      transition={{ duration: 0.22, ease }}
    />
  )
}

export function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const { toggle } = useTheme()
  const { result, cloud, bot, conflict, hideValues, toggleHideValues, refreshCloud } = useAppData()
  const toast = useToast()
  const [searchOpen, setSearchOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const navigate = useNavigate()
  const runShortcut = useCallback(
    (a: ShortcutAction) => {
      if (a === 'search') setSearchOpen(true)
      else if (a === 'simulator') setSimOpen(true)
      else if (a === 'hide') toggleHideValues()
      else if (a === 'theme') toggle()
      else if (a === 'help') navigate('/configuracoes#atalhos')
      else navigate(a.go)
    },
    [navigate, toggle, toggleHideValues],
  )
  useShortcuts(runShortcut)
  // app instalado no celular: arrastar da borda esquerda volta; puxar para baixo no topo atualiza (no navegador, o próprio navegador faz isso)
  const { pull, refreshing } = useGestures({
    enabled: isStandalone(),
    canGoBack: () => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0,
    onBack: () => navigate(-1),
    onRefresh: async () => {
      refreshCloud()
      window.dispatchEvent(new Event(REFRESH_EVENT))
      await new Promise((ok) => window.setTimeout(ok, 800))
      toast.show('Atualizado')
    },
  })
  const isDemo = result?.source === 'demo'
  // aviso discreto no ícone quando a conta não respondeu (detalhe em Configurações)
  const cloudError = cloud.status === 'error' || bot.status === 'error' || !!conflict
  // anima só ao trocar de seção: /pessoas → /pessoas/:id não refaz a página inteira
  const section = '/' + (location.pathname.split('/')[1] ?? '')

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2 focus:text-sm"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-sm supports-[backdrop-filter]:bg-bg/80">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-6 px-4 md:px-6">
          <NavLink to="/" className="flex items-center gap-2 rounded-sm" aria-label="BarnaBank, ir para o Início">
            <img src={logoUrl} alt="" aria-hidden="true" className="h-6 w-auto" />
            <span className="text-sm font-semibold tracking-tight">BarnaBank</span>
          </NavLink>

          <nav aria-label="Seções" className="hidden h-full md:block">
            <ul className="flex h-full items-stretch gap-1">
              {NAV.map(({ to, label }) => (
                <li key={to} className="flex">
                  <NavLink
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center px-3 text-sm font-medium transition-colors',
                        isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {label}
                        {isActive && <Underline id="nav-top" className="inset-x-3 h-[3px]" />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {isDemo && (
              <Badge variant="accent" title="Nenhum dado do BarnaBank foi encontrado neste navegador. Mostrando dados fictícios.">
                Demonstração
              </Badge>
            )}
            <Tooltip label="Buscar (Ctrl+K ou /)" side="bottom" bubbleClassName="md:hidden">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Buscar"
                aria-keyshortcuts="Control+K"
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[7px] text-sm text-fg-muted transition-colors hover:bg-fg/12 hover:text-fg md:w-64 md:justify-start md:border md:border-border md:bg-surface-2/40 md:pr-1.5 md:pl-3 md:backdrop-blur-md md:hover:border-border-strong [&_svg]:size-4 [&_svg]:shrink-0"
              >
                <Search aria-hidden="true" />
                <span aria-hidden="true" className="hidden flex-1 text-left md:block">
                  Buscar…
                </span>
                <Kbd aria-hidden="true" className="hidden md:inline-flex">
                  Ctrl K
                </Kbd>
              </button>
            </Tooltip>
            <Tooltip label="Simulador de empréstimo" side="bottom">
              <Button variant="ghost" size="icon" className="hover:bg-fg/12" onClick={() => setSimOpen(true)} aria-label="Simulador de empréstimo">
                <Calculator />
              </Button>
            </Tooltip>
            <Tooltip label={hideValues ? 'Mostrar valores' : 'Esconder valores'} side="bottom">
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-fg/12"
                onClick={toggleHideValues}
                aria-pressed={hideValues}
                aria-label={hideValues ? 'Mostrar valores' : 'Esconder valores'}
              >
                {hideValues ? <EyeOff /> : <Eye />}
              </Button>
            </Tooltip>
            <Tooltip label="Configurações" side="bottom" align="end">
              <NavLink
                to="/configuracoes"
                aria-label="Configurações"
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex size-9 items-center justify-center rounded-[7px] transition-colors hover:bg-fg/12 hover:text-fg [&_svg]:size-4',
                    isActive ? 'text-fg' : 'text-fg-muted',
                  )
                }
              >
                <Settings aria-hidden="true" />
                {cloudError && <span aria-hidden="true" className="absolute top-2 right-2 size-1.5 rounded-full bg-neg" />}
              </NavLink>
            </Tooltip>
          </div>
        </div>
      </header>

      <SyncConflictDialog />
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SimulatorDialog open={simOpen} onClose={() => setSimOpen(false)} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="conteudo"
          key={section}
          tabIndex={-1}
          className="mx-auto max-w-[1120px] px-4 pt-6 pb-28 outline-none md:px-6 md:pt-10 md:pb-16"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.18, ease }}
        >
          {outlet}
        </motion.main>
      </AnimatePresence>

      <QuickAdd />

      {(pull > 0 || refreshing) && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center pt-[env(safe-area-inset-top)]">
          <span
            className="mt-2 grid size-9 place-items-center rounded-full border border-border bg-surface text-fg-muted shadow-md"
            style={{ transform: `translateY(${refreshing ? 24 : pull - 8}px)`, transition: pull > 0 && !refreshing ? 'none' : 'transform 0.2s' }}
          >
            {refreshing ? (
              <Loader2 className="size-4 motion-safe:animate-spin" />
            ) : (
              <ArrowDown className="size-4 transition-transform" style={{ transform: pull >= PULL_THRESHOLD ? 'rotate(180deg)' : undefined }} />
            )}
          </span>
        </div>
      )}

      <nav
        aria-label="Seções"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                    isActive ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="size-5" aria-hidden="true" strokeWidth={isActive ? 2 : 1.75} />
                    <span className="relative pb-1">
                      {label}
                      {isActive && <Underline id="nav-bottom" />}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
