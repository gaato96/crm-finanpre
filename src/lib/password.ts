/**
 * Política de contraseñas, única para todo el sistema.
 *
 * Antes cada camino pedía algo distinto: el registro público 6 caracteres, el
 * alta desde el CRM 8 y el cambio de contraseña propia 10. El camino más débil
 * era justamente el abierto a internet.
 */

/** Mínimo de caracteres para cualquier contraseña de la plataforma. */
export const PASSWORD_MIN_LENGTH = 10

/** Mínimo para cuentas con acceso al panel (admin y vendedor). */
export const STAFF_PASSWORD_MIN_LENGTH = 12

const COMMON_PASSWORDS = new Set([
  '1234567890', 'contrasena1', 'contraseña1', 'password12', 'password123',
  'qwertyuiop', 'administrador', 'rendimax123', 'finanpre123', 'abcd123456',
])

export interface PasswordCheck {
  valid: boolean
  error?: string
  /** 0–4: muy débil, débil, aceptable, buena, fuerte. */
  score: number
  label: string
}

/**
 * Valida una contraseña y devuelve además su fuerza, para poder mostrar el
 * medidor en el formulario y rechazarla con el mismo criterio en el servidor.
 */
export function checkPassword(password: string, isStaff = false): PasswordCheck {
  const min = isStaff ? STAFF_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH
  const value = password ?? ''

  const hasLower = /[a-záéíóúñü]/.test(value)
  const hasUpper = /[A-ZÁÉÍÓÚÑÜ]/.test(value)
  const hasDigit = /\d/.test(value)
  const hasSymbol = /[^\w\s]/.test(value)

  let score = 0
  if (value.length >= min) score++
  if (value.length >= min + 4) score++
  if (hasLower && hasUpper) score++
  if (hasDigit) score++
  if (hasSymbol) score++
  score = Math.min(4, score)

  const labels = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte']
  const label = labels[score]

  if (!value) return { valid: false, error: 'Ingresá una contraseña.', score: 0, label: labels[0] }

  if (value.length < min) {
    return {
      valid: false,
      error: `La contraseña debe tener al menos ${min} caracteres.`,
      score,
      label,
    }
  }
  if (!hasLower || !hasUpper) {
    return {
      valid: false,
      error: 'La contraseña debe combinar mayúsculas y minúsculas.',
      score,
      label,
    }
  }
  if (!hasDigit) {
    return { valid: false, error: 'La contraseña debe incluir al menos un número.', score, label }
  }
  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return { valid: false, error: 'Esa contraseña es demasiado común. Elegí otra.', score: 0, label: labels[0] }
  }
  if (/^(.)\1+$/.test(value)) {
    return { valid: false, error: 'La contraseña no puede ser un solo carácter repetido.', score: 0, label: labels[0] }
  }

  return { valid: true, score, label }
}

/** Requisitos en texto, para mostrarlos en el formulario. */
export function passwordRequirements(isStaff = false): string {
  const min = isStaff ? STAFF_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH
  return `Mínimo ${min} caracteres, con mayúsculas, minúsculas y al menos un número.`
}
