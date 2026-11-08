import { cn } from '@/lib/utils'

// Spinner do botão de recarregar: anel fraco com um arco que gira sem parar em volta do centro (0,8 s por volta).
// O anel inteiro deixa o círculo sempre igual a si mesmo, então não parece "mudar de posição" ao girar
// (o arco de 3/4 do lucide parecia balançar porque o peso visual dele não fica no centro).
export function LoaderCircleIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('animate-spin [animation-duration:0.8s]', className)}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <circle cx="12" cy="12" r="9" strokeDasharray="14 56.5" />
    </svg>
  )
}
