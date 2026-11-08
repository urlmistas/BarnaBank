import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

// Ícone "loader-circle" (lucide-animated): só o arco gira, em volta do próprio centro, sem parar.
export function LoaderCircleIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(className)}
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
      <motion.path
        animate={{ rotate: 360 }}
        d="M21 12a9 9 0 1 1-6.219-8.56"
        style={{ transformOrigin: '12px 12px' }}
        transition={{ repeat: Number.POSITIVE_INFINITY, duration: 0.8, ease: 'linear' }}
      />
    </svg>
  )
}
