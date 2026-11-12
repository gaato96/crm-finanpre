'use client'

import { useId, useState } from 'react'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkPassword, passwordRequirements } from '@/lib/password'

interface PasswordFieldProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  /** Muestra el medidor de fuerza y la lista de requisitos. */
  showStrength?: boolean
  /** Exige el mínimo reforzado de las cuentas con acceso al panel. */
  isStaff?: boolean
  required?: boolean
  autoComplete?: string
  disabled?: boolean
  className?: string
}

const BAR_COLORS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500']
const TEXT_COLORS = ['text-red-400', 'text-orange-400', 'text-amber-400', 'text-blue-400', 'text-emerald-400']

/**
 * Campo de contraseña con botón de mostrar/ocultar y medidor de fuerza.
 * Centraliza la política para que todos los formularios pidan lo mismo.
 */
export function PasswordField({
  value,
  onChange,
  label = 'Contraseña',
  placeholder = '••••••••••',
  showStrength = false,
  isStaff = false,
  required = true,
  autoComplete = 'new-password',
  disabled = false,
  className = '',
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const id = useId()

  const result = checkPassword(value, isStaff)
  const min = isStaff ? 12 : 10

  const rules = [
    { ok: value.length >= min, text: `${min} caracteres o más` },
    { ok: /[a-záéíóúñü]/.test(value) && /[A-ZÁÉÍÓÚÑÜ]/.test(value), text: 'Mayúsculas y minúsculas' },
    { ok: /\d/.test(value), text: 'Al menos un número' },
  ]

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium text-foreground/80">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-describedby={showStrength ? `${id}-help` : undefined}
          className={`h-12 bg-input/50 border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/50 pr-12 text-base ${className}`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
      </div>

      {showStrength && (
        <div id={`${id}-help`} className="space-y-2 pt-0.5">
          {value.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < result.score ? BAR_COLORS[result.score] : 'bg-border'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[11px] font-semibold ${TEXT_COLORS[result.score]}`}>
                  {result.label}
                </span>
              </div>

              <ul className="space-y-0.5">
                {rules.map((rule) => (
                  <li
                    key={rule.text}
                    className={`flex items-center gap-1.5 text-[11px] ${
                      rule.ok ? 'text-emerald-400' : 'text-muted-foreground'
                    }`}
                  >
                    {rule.ok ? (
                      <Check className="w-3 h-3 shrink-0" />
                    ) : (
                      <X className="w-3 h-3 shrink-0 opacity-50" />
                    )}
                    {rule.text}
                  </li>
                ))}
              </ul>
            </>
          )}
          {value.length === 0 && (
            <p className="text-[11px] text-muted-foreground">{passwordRequirements(isStaff)}</p>
          )}
        </div>
      )}
    </div>
  )
}
