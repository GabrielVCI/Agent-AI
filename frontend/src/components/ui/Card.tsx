import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

interface CardHeaderProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

const paddings = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' }

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm ${paddings[padding]} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, description, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`flex items-start justify-between mb-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {action && <div className="ml-4 flex-shrink-0">{action}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string | number
  icon?: ReactNode
  trend?: { value: number; label: string }
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}

const statVariants = {
  default: { icon: 'bg-slate-100 text-slate-600', value: 'text-slate-900' },
  primary: { icon: 'bg-primary-100 text-primary-600', value: 'text-slate-900' },
  success: { icon: 'bg-green-100 text-green-600', value: 'text-slate-900' },
  warning: { icon: 'bg-amber-100 text-amber-600', value: 'text-slate-900' },
  danger: { icon: 'bg-red-100 text-red-600', value: 'text-slate-900' },
}

export function StatCard({ label, value, icon, trend, variant = 'default', className = '' }: StatCardProps) {
  const v = statVariants[variant]
  return (
    <Card className={className}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide truncate">{label}</p>
          <p className={`mt-2 text-2xl font-bold ${v.value}`}>{value}</p>
          {trend && (
            <p className={`mt-1 text-xs ${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        {icon && (
          <div className={`flex-shrink-0 p-2.5 rounded-lg ${v.icon}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  )
}
