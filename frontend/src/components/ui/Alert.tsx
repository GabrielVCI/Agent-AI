import { ReactNode } from 'react'
import { AlertTriangle, Info, CheckCircle, XCircle } from 'lucide-react'

type Variant = 'info' | 'success' | 'warning' | 'danger'

interface Props {
  variant?: Variant
  title?: string
  children: ReactNode
  className?: string
}

const config: Record<Variant, { icon: ReactNode; classes: string }> = {
  info: {
    icon: <Info className="h-4 w-4" />,
    classes: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  success: {
    icon: <CheckCircle className="h-4 w-4" />,
    classes: 'bg-green-50 border-green-200 text-green-800',
  },
  warning: {
    icon: <AlertTriangle className="h-4 w-4" />,
    classes: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  danger: {
    icon: <XCircle className="h-4 w-4" />,
    classes: 'bg-red-50 border-red-200 text-red-800',
  },
}

export default function Alert({ variant = 'info', title, children, className = '' }: Props) {
  const { icon, classes } = config[variant]
  return (
    <div className={`flex gap-3 p-4 rounded-lg border ${classes} ${className}`}>
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        {title && <p className="font-medium text-sm mb-1">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}
