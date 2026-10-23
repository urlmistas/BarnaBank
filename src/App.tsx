import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { DataProvider } from '@/app/data-context'
import { AppShell } from '@/app/AppShell'
import { Inicio } from '@/pages/inicio/Inicio'

// Pessoas em chunk próprio (o Início continua no bundle principal)
const Pessoas = lazy(() => import('@/pages/pessoas/Pessoas').then((m) => ({ default: m.Pessoas })))
const pessoas = (
  <Suspense fallback={null}>
    <Pessoas />
  </Suspense>
)
const Contas = lazy(() => import('@/pages/contas/Contas').then((m) => ({ default: m.Contas })))
const contas = (
  <Suspense fallback={null}>
    <Contas />
  </Suspense>
)
const Relatorios = lazy(() => import('@/pages/relatorios/Relatorios').then((m) => ({ default: m.Relatorios })))
const relatorios = (
  <Suspense fallback={null}>
    <Relatorios />
  </Suspense>
)
const Carteiras = lazy(() => import('@/pages/carteiras/Carteiras').then((m) => ({ default: m.Carteiras })))
const carteiras = (
  <Suspense fallback={null}>
    <Carteiras />
  </Suspense>
)

// HashRouter: no GitHub Pages, recarregar /barna-bank/#/pessoas não dá 404.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Inicio />} />
              <Route path="pessoas" element={pessoas} />
              <Route path="pessoas/:id" element={pessoas} />
              <Route path="carteiras" element={carteiras} />
              <Route path="carteiras/:id" element={carteiras} />
              <Route path="contas" element={contas} />
              <Route path="contas/:id" element={contas} />
              <Route path="relatorios" element={relatorios} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </DataProvider>
    </MotionConfig>
  )
}
