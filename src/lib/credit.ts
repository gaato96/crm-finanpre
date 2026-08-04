import type { CreditType, Currency } from './types'

// ──────────────────────────────────────────
// FECHAS DE VENCIMIENTO
// ──────────────────────────────────────────

/**
 * Suma meses a una fecha manteniendo el día de pago elegido.
 * Si el mes destino no tiene ese día (ej: 31 en febrero), usa el último día del mes.
 * Se opera a mediodía para evitar corrimientos por zona horaria.
 */
export function addMonthsKeepingDay(dateStr: string, months: number): string {
  const base = new Date(dateStr + 'T12:00:00')
  const day = base.getDate()
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1, 12, 0, 0)
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(day, lastDayOfTargetMonth))
  return toISODate(target)
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha por defecto para la primera cuota: mismo día del mes siguiente. */
export function defaultFirstDueDate(fromISO?: string): string {
  const base = fromISO ?? toISODate(new Date())
  return addMonthsKeepingDay(base, 1)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ──────────────────────────────────────────
// GENERACIÓN DE PLANES DE PAGO
// ──────────────────────────────────────────

export interface ScheduleInstallment {
  installment_number: number
  amount: number
  principal_amount: number
  interest_amount: number
  due_date: string
  is_interest_only: boolean
}

export interface ScheduleParams {
  creditType: CreditType
  /** Capital prestado */
  total: number
  /** Tasa en % — ver semántica por tipo en generateSchedule */
  rate: number
  /** Cantidad de cuotas (fija/decreciente) o meses proyectados (refinanciación) */
  installments: number
  /** Fecha de vencimiento de la primera cuota (YYYY-MM-DD) */
  firstDueDate: string
}

/**
 * Genera el plan de cuotas según el tipo de crédito.
 *
 * - `fija`: la tasa es el interés TOTAL sobre el capital. Todas las cuotas son iguales.
 *   Se mantiene la fórmula histórica del sistema para no alterar créditos ya otorgados.
 *
 * - `decreciente` (sistema alemán): la tasa es MENSUAL sobre el saldo pendiente.
 *   Amortización de capital constante (capital / n) + interés sobre el saldo,
 *   por lo que la cuota baja un monto fijo mes a mes.
 *
 * - `refinanciacion`: la tasa es MENSUAL sobre el capital. El cliente paga solo el
 *   interés para mantener el préstamo vigente; el capital se cancela cuando decide.
 */
export function generateSchedule(params: ScheduleParams): ScheduleInstallment[] {
  const { creditType, total, rate, installments, firstDueDate } = params
  if (!(total > 0) || !(installments > 0) || !firstDueDate) return []

  const dueDateFor = (i: number) => addMonthsKeepingDay(firstDueDate, i)

  if (creditType === 'refinanciacion') {
    const monthlyInterest = round2(total * (rate / 100))
    return Array.from({ length: installments }, (_, i) => ({
      installment_number: i + 1,
      amount: monthlyInterest,
      principal_amount: 0,
      interest_amount: monthlyInterest,
      due_date: dueDateFor(i),
      is_interest_only: true,
    }))
  }

  if (creditType === 'decreciente') {
    const principalPerInstallment = total / installments
    return Array.from({ length: installments }, (_, i) => {
      const outstanding = total - principalPerInstallment * i
      const interest = round2(outstanding * (rate / 100))
      const principal = round2(principalPerInstallment)
      return {
        installment_number: i + 1,
        amount: round2(principal + interest),
        principal_amount: principal,
        interest_amount: interest,
        due_date: dueDateFor(i),
        is_interest_only: false,
      }
    })
  }

  // 'fija' — cuotas iguales, interés total sobre el capital
  const totalWithInterest = total * (1 + rate / 100)
  const amount = round2(totalWithInterest / installments)
  const principal = round2(total / installments)
  const schedule = Array.from({ length: installments }, (_, i) => ({
    installment_number: i + 1,
    amount,
    principal_amount: principal,
    interest_amount: round2(amount - principal),
    due_date: dueDateFor(i),
    is_interest_only: false,
  }))

  // La última cuota absorbe la diferencia de redondeo para que el total cierre exacto
  const diff = round2(totalWithInterest - amount * installments)
  if (diff !== 0 && schedule.length > 0) {
    const last = schedule[schedule.length - 1]
    last.amount = round2(last.amount + diff)
    last.interest_amount = round2(last.amount - last.principal_amount)
  }

  return schedule
}

// ──────────────────────────────────────────
// TOTALES Y RESÚMENES
// ──────────────────────────────────────────

export interface ScheduleSummary {
  totalToPay: number
  totalInterest: number
  firstInstallment: number
  lastInstallment: number
  /** Cuánto baja la cuota mes a mes (solo tipo decreciente) */
  monthlyDecrease: number
}

export function summarizeSchedule(
  schedule: ScheduleInstallment[],
  creditType: CreditType,
  total: number
): ScheduleSummary {
  if (schedule.length === 0) {
    return { totalToPay: 0, totalInterest: 0, firstInstallment: 0, lastInstallment: 0, monthlyDecrease: 0 }
  }

  const sumInstallments = round2(schedule.reduce((s, i) => s + i.amount, 0))
  const first = schedule[0]
  const last = schedule[schedule.length - 1]

  // En refinanciación las cuotas son solo interés: para cancelar hay que sumar el capital
  const totalToPay = creditType === 'refinanciacion' ? round2(sumInstallments + total) : sumInstallments

  return {
    totalToPay,
    totalInterest: round2(schedule.reduce((s, i) => s + i.interest_amount, 0)),
    firstInstallment: first.amount,
    lastInstallment: last.amount,
    monthlyDecrease: creditType === 'decreciente' && schedule.length > 1 ? round2(first.amount - schedule[1].amount) : 0,
  }
}

/**
 * Monto necesario para cancelar por completo una refinanciación:
 * capital prestado + el interés del período en curso.
 */
export function calculatePayoffAmount(total: number, rate: number): number {
  return round2(total + total * (rate / 100))
}

// ──────────────────────────────────────────
// MORA
// ──────────────────────────────────────────

/** Días de atraso de una cuota respecto de hoy (0 si aún no venció). */
export function daysLateFor(dueDate: string): number {
  const due = new Date(dueDate + 'T12:00:00')
  due.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)))
}

/** Interés punitorio acumulado por mora diaria sobre el monto de la cuota. */
export function calculateLateInterest(amount: number, dailyRate: number, daysLate: number): number {
  if (daysLate <= 0 || !dailyRate) return 0
  return round2(amount * (dailyRate / 100) * daysLate)
}

// ──────────────────────────────────────────
// ETIQUETAS
// ──────────────────────────────────────────

export const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  fija: 'Cuotas fijas',
  decreciente: 'Cuotas decrecientes',
  refinanciacion: 'Refinanciación constante',
}

export const CREDIT_TYPE_DESCRIPTIONS: Record<CreditType, string> = {
  fija: 'Todas las cuotas iguales. La tasa es el interés total sobre el capital.',
  decreciente: 'La cuota baja un monto fijo cada mes (sistema alemán). Tasa mensual sobre el saldo.',
  refinanciacion: 'El cliente paga solo el interés mensual y cancela el capital cuando puede.',
}

export const CREDIT_TYPE_RATE_LABELS: Record<CreditType, string> = {
  fija: 'Tasa total (%)',
  decreciente: 'Tasa mensual s/ saldo (%)',
  refinanciacion: 'Tasa mensual s/ capital (%)',
}

export function getCreditTypeColor(type: CreditType): string {
  const colors: Record<CreditType, string> = {
    fija: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    decreciente: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    refinanciacion: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  }
  return colors[type] ?? colors.fija
}

/** Moneda por defecto usada en los resúmenes de crédito. */
export const DEFAULT_CREDIT_CURRENCY: Currency = 'ARS'
