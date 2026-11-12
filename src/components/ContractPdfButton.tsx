'use client'

import { useState } from 'react'
import { Download, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getContractPdfUrl } from '@/lib/documents-actions'

interface ContractPdfButtonProps {
  contractId: string
  label?: string
  /** `true` cuando el contrato todavía no se firmó: no hay PDF que bajar. */
  disabled?: boolean
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost' | 'default'
  className?: string
  iconOnly?: boolean
}

/**
 * Descarga del PDF de un contrato firmado.
 *
 * El bucket `contracts` pasó a ser privado, así que ya no se puede enlazar una
 * URL pública: se pide una URL firmada al servidor, que de paso valida que
 * quien la pide sea el titular del contrato o personal autorizado.
 */
export function ContractPdfButton({
  contractId,
  label = 'Contrato PDF',
  disabled = false,
  size = 'sm',
  variant = 'outline',
  className = '',
  iconOnly = false,
}: ContractPdfButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)

    const result = await getContractPdfUrl(contractId)

    if (result.error || !result.url) {
      setError(result.error ?? 'No se pudo abrir el documento.')
      setLoading(false)
      setTimeout(() => setError(null), 5000)
      return
    }

    window.open(result.url, '_blank', 'noopener,noreferrer')
    setLoading(false)
  }

  if (error) {
    return (
      <span
        title={error}
        className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 shrink-0"
      >
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        {iconOnly ? '' : 'No disponible'}
      </span>
    )
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleClick}
      disabled={disabled || loading}
      title={disabled ? 'El contrato todavía no fue firmado' : label}
      className={`gap-1.5 shrink-0 ${className}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      {!iconOnly && (loading ? 'Generando...' : label)}
    </Button>
  )
}
