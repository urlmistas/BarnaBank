import { cn } from '@/lib/utils'

// Ícone "loader-circle" (lucide-animated): o arco gira sem parar em volta do centro (0,8 s por volta).
// Animação em CSS puro: a do `motion` em <path> não girava de verdade neste navegador (a matriz de transformação ficava parada).
export function LoaderCircleIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('animate-spin [animation-duration:0.8s]', className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
