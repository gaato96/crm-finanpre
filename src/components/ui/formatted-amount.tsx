import React from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatCurrencyPrecise } from '@/lib/helpers'

interface FormattedAmountProps {
  amount: number
  currency: 'ARS' | 'USD'
  precise?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
  color?: string
}

export function FormattedAmount({
  amount,
  currency,
  precise = false,
  className = '',
  size = 'md',
  color = ''
}: FormattedAmountProps) {
  const formatted = precise 
    ? formatCurrencyPrecise(amount, currency) 
    : formatCurrency(amount, currency)
    
  const lastComma = formatted.lastIndexOf(',')
  const lastDot = formatted.lastIndexOf('.')
  const separatorIndex = lastComma > lastDot ? lastComma : lastDot
  
  if (separatorIndex === -1) {
    return <span className={cn("font-bold", className)}>{formatted}</span>
  }
  
  const main = formatted.substring(0, separatorIndex)
  const decimals = formatted.substring(separatorIndex) // e.g. ",8901" or ",89"
  
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
    '4xl': 'text-4xl'
  }
  
  const decimalSizeClasses = {
    sm: 'text-[10px]',
    md: 'text-xs',
    lg: 'text-xs',
    xl: 'text-xs sm:text-sm',
    '2xl': 'text-xs sm:text-sm',
    '3xl': 'text-sm sm:text-base',
    '4xl': 'text-base sm:text-lg'
  }
  
  return (
    <span className={cn("font-bold tracking-tight tabular-nums inline-flex items-baseline", sizeClasses[size], color, className)}>
      <span>{main}</span>
      <span className={cn("font-medium opacity-80 ml-0.5", decimalSizeClasses[size])}>
        {decimals}
      </span>
    </span>
  )
}
