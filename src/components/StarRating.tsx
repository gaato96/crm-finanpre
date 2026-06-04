'use client'

import { useState } from 'react'

interface StarRatingProps {
  value: number       // 0–5, pasos de 0.5
  onChange?: (value: number) => void
  readOnly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_MAP = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
}

export function StarRating({ value, onChange, readOnly = false, size = 'md' }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [instanceId] = useState(() => Math.random().toString(36).slice(2, 8))
  const display = readOnly ? value : (hovered ?? value)
  const starSize = SIZE_MAP[size]

  function handleMouseMove(e: React.MouseEvent<HTMLButtonElement>, starIndex: number) {
    if (readOnly) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const half = x < rect.width / 2
    setHovered(half ? starIndex - 0.5 : starIndex)
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>, starIndex: number) {
    if (readOnly || !onChange) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const half = x < rect.width / 2
    const newValue = half ? starIndex - 0.5 : starIndex
    onChange(newValue)
  }

  return (
    <div
      className="flex items-center gap-0.5"
      onMouseLeave={() => !readOnly && setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = display >= star
        const halfFilled = !filled && display >= star - 0.5
        const clipId = `half-${instanceId}-${star}`

        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            className={`relative focus:outline-none ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
            onMouseMove={(e) => handleMouseMove(e, star)}
            onClick={(e) => handleClick(e, star)}
          >
            <svg
              viewBox="0 0 24 24"
              className={`${starSize} transition-colors duration-100`}
              fill="none"
            >
              {/* Fondo gris oscuro */}
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill="rgba(255, 255, 255, 0.15)"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeWidth="1"
              />
              {/* Media estrella izquierda */}
              {halfFilled && (
                <>
                  <defs>
                    <clipPath id={clipId}>
                      <rect x="0" y="0" width="12" height="24" />
                    </clipPath>
                  </defs>
                  <path
                    d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    fill="#f59e0b"
                    clipPath={`url(#${clipId})`}
                  />
                </>
              )}
              {/* Estrella completa */}
              {filled && (
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#f59e0b"
                />
              )}
            </svg>
          </button>
        )
      })}
      {!readOnly && (
        <span className="ml-2 text-xs text-muted-foreground tabular-nums w-6">
          {display.toFixed(1)}
        </span>
      )}
    </div>
  )
}

/**
 * Badge de nivel de confianza para usar en tablas.
 */
export function TrustBadge({ level }: { level: number }) {
  const color =
    level >= 4 ? 'text-emerald-400' :
    level >= 3 ? 'text-amber-400' :
    level >= 2 ? 'text-orange-400' :
    'text-red-400'

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <StarRating value={level} readOnly size="sm" />
    </div>
  )
}
