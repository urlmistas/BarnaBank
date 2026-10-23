import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChartColumn, House, Moon, Receipt, Sun, Users, Wallet, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTheme } from './theme'
import { useAppData } from './data-context'

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Início', icon: House },
  { to: '/pessoas', label: 'Pessoas', icon: Users },
  { to: '/carteiras', label: 'Carteiras', icon: Wallet },
  { to: '/contas', label: 'Contas', icon: Receipt },
  { to: '/relatorios', label: 'Relatórios', icon: ChartColumn },
]

const ease = [0.2, 0, 0, 1] as const

function Underline({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      aria-hidden="true"
      className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent"
      transition={{ duration: 0.22, ease }}
    />
  )
}

export function AppShell() {
  const location = useLocation()
  const outlet = useOutlet()
  const { theme, toggle } = useTheme()
  const { result } = useAppData()
  const isDemo = result?.source === 'demo'
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
            <span aria-hidden="true" className="grid size-6 place-items-center rounded-sm bg-accent text-xs font-semibold text-accent-fg">
              B
            </span>
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
                        {isActive && <Underline id="nav-top" />}
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
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
              title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
          </div>
        </div>
      </header>

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
