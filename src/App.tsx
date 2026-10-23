import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { DataProvider } from '@/app/data-context'
import { AppShell } from '@/app/AppShell'
import { Inicio } from '@/pages/inicio/Inicio'
import { Placeholder } from '@/pages/Placeholder'

// HashRouter: no GitHub Pages, recarregar /barna-bank/#/pessoas não dá 404.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Inicio />} />
              <Route
                path="pessoas"
                element={<Placeholder title="Pessoas" description="Empréstimos e dívidas por pessoa e por grupo, com parcelas, histórico e registro de pagamento." />}
              />
              <Route
                path="carteiras"
                element={<Placeholder title="Carteiras" description="Saldo de cada carteira, lançamentos, transferências e recorrentes." />}
              />
              <Route
                path="contas"
                element={<Placeholder title="Contas" description="Contas fixas, cartões de crédito e faturas, com calendário do mês." />}
              />
              <Route
                path="relatorios"
                element={<Placeholder title="Relatórios" description="Gastos por categoria, orçamento, metas e evolução do saldo." />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </DataProvider>
    </MotionConfig>
  )
}
