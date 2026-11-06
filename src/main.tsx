import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// botão principal "liquid glass": a luz acompanha o ponteiro
document.addEventListener('pointermove', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>("[data-slot='button'][data-variant='default']")
  if (!b) return
  const r = b.getBoundingClientRect()
  b.style.setProperty('--x', e.clientX - r.left + 'px')
  b.style.setProperty('--y', e.clientY - r.top + 'px')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
