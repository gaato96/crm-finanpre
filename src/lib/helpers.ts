import { type Contract } from './types'

/**
 * Calcula el capital actual con interés compuesto mensual.
 * Fórmula: capital_actual = capital_inicial × (1 + tasa/100)^(días_transcurridos/30)
 */
export function calculateCompoundCapital(contract: Contract): number {
  const startDate = new Date(contract.start_date)
  const now = new Date()
  const elapsedMs = now.getTime() - startDate.getTime()
  if (elapsedMs <= 0) return contract.initial_capital

  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24)
  const monthlyRate = contract.monthly_rate / 100
  return contract.initial_capital * Math.pow(1 + monthlyRate, elapsedDays / 30)
}

/**
 * Interés acumulado hasta ahora (compuesto).
 */
export function calculateAccruedInterest(contract: Contract): number {
  return calculateCompoundCapital(contract) - contract.initial_capital
}

/**
 * Ganancia por segundo (para el ticker en tiempo real).
 */
export function calculateEarningsPerSecond(contract: Contract): number {
  const capital = calculateCompoundCapital(contract)
  const dailyRate = Math.pow(1 + contract.monthly_rate / 100, 1 / 30) - 1
  return (capital * dailyRate) / (24 * 60 * 60)
}

/**
 * @deprecated Usar calculateCompoundCapital
 */
export function calculateRealtimeValue(contract: Contract): number {
  return calculateCompoundCapital(contract)
}

/**
 * @deprecated Usar calculateCompoundCapital
 */
export function calculateDailyEarnings(contract: Contract): number {
  const capital = calculateCompoundCapital(contract)
  return capital * (Math.pow(1 + contract.monthly_rate / 100, 1 / 30) - 1)
}

/**
 * Proyección del capital a N meses.
 */
export function projectCapital(
  initialCapital: number,
  monthlyRate: number,
  months: number
): { month: number; capital: number; interest: number }[] {
  const results = []
  for (let m = 0; m <= months; m++) {
    const capital = initialCapital * Math.pow(1 + monthlyRate / 100, m)
    results.push({ month: m, capital, interest: capital - initialCapital })
  }
  return results
}

/**
 * Formato de moneda.
 */
export function formatCurrency(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Formato con alta precisión (para ticker).
 */
export function formatCurrencyPrecise(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(amount)
}

/**
 * Verifica si el contrato vence en menos de N horas.
 */
export function isNearExpiration(contract: Contract, hoursThreshold = 48): boolean {
  const endDate = new Date(contract.end_date)
  const now = new Date()
  const hoursRemaining = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hoursRemaining > 0 && hoursRemaining <= hoursThreshold
}

/**
 * Días restantes hasta el vencimiento.
 */
export function daysRemaining(contract: Contract): number {
  const endDate = new Date(contract.end_date)
  const now = new Date()
  const days = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, days)
}

/**
 * Formato de fecha legible.
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formato de fecha y hora.
 */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Progreso del contrato (0-100%).
 */
export function contractProgress(contract: Contract): number {
  const start = new Date(contract.start_date).getTime()
  const end = new Date(contract.end_date).getTime()
  const now = Date.now()
  const progress = ((now - start) / (end - start)) * 100
  return Math.min(100, Math.max(0, progress))
}

/**
 * Etiqueta legible para el estado del contrato.
 */
export function getContractStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    borrador: 'Borrador',
    enviado: 'Enviado al cliente',
    pendiente_fondos: 'Pendiente de fondos',
    activo: 'Activo',
    retiro_solicitado: 'Retiro solicitado',
    retirado: 'Retirado',
    reinvertido: 'Reinvertido',
    vencido: 'Vencido',
  }
  return labels[status] ?? status
}

/**
 * Color del badge según estado del contrato.
 */
export function getContractStatusColor(status: string): string {
  const colors: Record<string, string> = {
    borrador: 'text-slate-400 border-slate-400/30 bg-slate-400/10',
    enviado: 'text-blue-400 border-blue-400/30 bg-blue-400/10',
    pendiente_fondos: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    activo: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    retiro_solicitado: 'text-orange-400 border-orange-400/30 bg-orange-400/10',
    retirado: 'text-purple-400 border-purple-400/30 bg-purple-400/10',
    reinvertido: 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10',
    vencido: 'text-red-400 border-red-400/30 bg-red-400/10',
  }
  return colors[status] ?? 'text-slate-400 border-slate-400/30'
}

/**
 * Genera el SHA-256 de un string (para hash del contrato).
 */
export async function generateSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Convierte una plantilla estructurada en formato JSON a HTML si corresponde.
 */
export function compileStructuredTemplateToHtml(contentJson: string, name: string): string {
  try {
    const data = JSON.parse(contentJson)
    if (data && data.isStructured) {
      return `
<div class="contract-preview p-6 text-slate-300 font-sans leading-relaxed space-y-6">
  <div class="text-center border-b border-slate-800 pb-6 mb-6">
    <h1 class="text-xl font-bold tracking-wider text-emerald-400">${name.toUpperCase()}</h1>
    <p class="text-xs text-slate-500 mt-1">FinanPre · Plataforma de Inversiones</p>
  </div>
  <div class="space-y-4 text-sm">
    <p class="mb-4 whitespace-pre-line">${data.header}</p>
    ${(data.clauses || []).map((c: any) => `
      <div class="clause mb-4">
        <h3 class="font-bold text-slate-200 border-b border-slate-800/50 pb-1 mb-2">${c.title}</h3>
        <p class="whitespace-pre-line">${c.body}</p>
      </div>
    `).join('')}
    <p class="mt-6 pt-4 border-t border-slate-800 whitespace-pre-line">${data.footer}</p>
  </div>
</div>
      `
    }
  } catch (e) {
    // Tratar como HTML plano
  }
  return contentJson
}

/**
 * Rellena las variables de una plantilla de contrato.
 */
export function fillContractTemplate(
  template: string,
  variables: Record<string, string>,
  name = 'Contrato'
): string {
  const htmlTemplate = compileStructuredTemplateToHtml(template, name)
  let filled = htmlTemplate
  for (const [key, value] of Object.entries(variables)) {
    filled = filled.replaceAll(`{{${key}}}`, value)
  }
  return filled
}

/**
 * Convierte un número a texto en español (para "monto en letras").
 */
export function numberToWords(num: number): string {
  if (num === 0) return 'cero'
  const ones = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
  const tens = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
  const hundreds = ['', 'cien', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
    'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

  function convert(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100) {
      const ten = tens[Math.floor(n / 10)]
      const one = n % 10 === 0 ? '' : ` y ${ones[n % 10]}`
      return ten + one
    }
    if (n < 1000) {
      if (n === 100) return 'cien'
      return hundreds[Math.floor(n / 100)] + (n % 100 === 0 ? '' : ` ${convert(n % 100)}`)
    }
    if (n < 1000000) {
      const thousands = Math.floor(n / 1000)
      const rest = n % 1000
      return (thousands === 1 ? 'mil' : `${convert(thousands)} mil`) + (rest === 0 ? '' : ` ${convert(rest)}`)
    }
    return n.toLocaleString('es-AR')
  }

  const intPart = Math.floor(Math.abs(num))
  return convert(intPart).trim()
}

/**
 * Verifica si el contrato está dentro de la ventana de decisión (a menos de 48 horas de expirar).
 */
export function isWithinDecisionWindow(contract: Contract): boolean {
  return isNearExpiration(contract, 48)
}

