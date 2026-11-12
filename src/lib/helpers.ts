import { type Contract } from './types'

/**
 * Convierte una fecha de la base a `Date` sin corrimiento de zona horaria.
 *
 * Las columnas DATE llegan como 'YYYY-MM-DD' y `new Date('2026-01-15')` las
 * interpreta como medianoche UTC: en Argentina (UTC-3) eso se renderizaba como
 * el 14 de enero. Se fija el mediodía local para que el día nunca cambie.
 */
export function parseDbDate(value: string | Date): Date {
  if (value instanceof Date) return value
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`)
  return new Date(value)
}

/**
 * Calcula el capital con interés compuesto mensual, topeado en el vencimiento.
 * Fórmula: capital = capital_inicial × (1 + tasa/100)^(días/30)
 *
 * El devengamiento se detiene en `end_date`: un contrato que quedó en 'activo'
 * después de su vencimiento no puede seguir capitalizando indefinidamente.
 */
export function calculateCompoundCapital(contract: Contract, at: Date = new Date()): number {
  // El capital ya liquidado no se recalcula: se muestra lo que se pagó
  if (
    (contract.status === 'retirado' || contract.status === 'reinvertido') &&
    contract.current_capital != null
  ) {
    return Number(contract.current_capital)
  }

  const startDate = parseDbDate(contract.start_date)
  const endDate = parseDbDate(contract.end_date)

  const cutoff = at.getTime() < endDate.getTime() ? at : endDate
  const elapsedMs = cutoff.getTime() - startDate.getTime()
  if (elapsedMs <= 0) return contract.initial_capital

  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24)
  const monthlyRate = contract.monthly_rate / 100
  return contract.initial_capital * Math.pow(1 + monthlyRate, elapsedDays / 30)
}

/** `true` si el contrato ya dejó de devengar interés (alcanzó su vencimiento). */
export function hasStoppedAccruing(contract: Contract, at: Date = new Date()): boolean {
  return at.getTime() >= parseDbDate(contract.end_date).getTime()
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
  // Un contrato vencido no genera más interés: el ticker debe quedar quieto
  if (hasStoppedAccruing(contract)) return 0
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
  const endDate = parseDbDate(contract.end_date)
  const now = new Date()
  const hoursRemaining = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  return hoursRemaining > 0 && hoursRemaining <= hoursThreshold
}

/**
 * Días restantes hasta el vencimiento.
 */
export function daysRemaining(contract: Contract): number {
  const endDate = parseDbDate(contract.end_date)
  const now = new Date()
  const days = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(0, days)
}

/**
 * Ajusta una fecha para que, si cae en fin de semana (sábado o domingo),
 * se postergue automáticamente al próximo lunes (día hábil).
 */
export function adjustToNextBusinessDay(dateStr: string): string {
  const d = parseDbDate(dateStr)
  const day = d.getDay() // 0 = Domingo, 6 = Sábado
  if (day === 6) { // Sábado -> Lunes (+2 días)
    d.setDate(d.getDate() + 2)
  } else if (day === 0) { // Domingo -> Lunes (+1 día)
    d.setDate(d.getDate() + 1)
  }
  return toLocalISODate(d)
}

/**
 * Fecha en formato 'YYYY-MM-DD' según el calendario local.
 *
 * `toISOString()` convierte a UTC primero, así que en Argentina devolvía el día
 * anterior para cualquier hora de la mañana.
 */
export function toLocalISODate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Formato de fecha legible.
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  const d = parseDbDate(dateString)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formato de fecha y hora.
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  const d = parseDbDate(dateString)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formato de fecha largo, para los contratos ("15 de enero de 2026").
 */
export function formatDateLong(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  const d = parseDbDate(dateString)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Formatea un número de teléfono y genera el enlace para WhatsApp.
 * Si no tiene código de país, asume +54 (Argentina).
 */
export function formatWhatsAppUrl(telefono: string | null | undefined): string {
  if (!telefono) return ''
  // Elimina todo lo que no sea número
  const cleaned = telefono.replace(/\D/g, '')
  if (!cleaned) return ''
  
  // Si no empieza con el código de país (54), lo agregamos
  let withCountry = cleaned
  if (!cleaned.startsWith('54') && cleaned.length >= 10) {
    // Si tiene 15 de prefijo celular argentino local, quitarlo o acomodarlo si es necesario.
    // Generalmente para celular es 54 9 + área + número.
    // Si es un número local de 10 dígitos (ej: 381 1234567), agregamos 54 9 delante.
    if (cleaned.length === 10) {
      withCountry = `549${cleaned}`
    } else {
      withCountry = `54${cleaned}`
    }
  } else if (cleaned.startsWith('0') && cleaned.length > 10) {
    // Si empieza con 0, quitar el 0
    withCountry = `549${cleaned.substring(1)}`
  }
  
  return `https://wa.me/${withCountry}`
}

/**
 * Progreso del contrato (0-100%).
 */
export function contractProgress(contract: Contract): number {
  const start = parseDbDate(contract.start_date).getTime()
  const end = parseDbDate(contract.end_date).getTime()
  const span = end - start
  // Un contrato de duración nula daba NaN/Infinity y rompía la barra de progreso
  if (!Number.isFinite(span) || span <= 0) return 100
  const progress = ((Date.now() - start) / span) * 100
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
    en_consignacion: 'En consignación',
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
    en_consignacion: 'text-orange-400 border-orange-400/30 bg-orange-500/10',
    activo: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    retiro_solicitado: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10',
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
 * Escapa texto para insertarlo en HTML.
 *
 * Necesario porque la previsualización y el PDF del contrato se renderizan con
 * `dangerouslySetInnerHTML`: el nombre que el propio usuario eligió al
 * registrarse termina dentro de ese HTML, así que sin escapar era un vector de
 * XSS almacenado (y cualquier `<` rompía el documento).
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
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
    <h1 class="text-xl font-bold tracking-wider text-blue-400">${escapeHtml(name.toUpperCase())}</h1>
    <p class="text-xs text-slate-500 mt-1">RENDIMAX · Plataforma de Inversiones</p>
  </div>
  <div class="space-y-4 text-sm">
    <p class="mb-4 whitespace-pre-line">${escapeHtml(data.header)}</p>
    ${(data.clauses || []).map((c: any) => `
      <div class="clause mb-4">
        <h3 class="font-bold text-slate-200 border-b border-slate-800/50 pb-1 mb-2">${escapeHtml(c.title)}</h3>
        <p class="whitespace-pre-line">${escapeHtml(c.body)}</p>
      </div>
    `).join('')}
    <p class="mt-6 pt-4 border-t border-slate-800 whitespace-pre-line">${escapeHtml(data.footer)}</p>
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
 *
 * Los valores se escapan: salen de datos del cliente (nombre, domicilio) que
 * el propio usuario cargó al registrarse, y el resultado se inyecta con
 * `dangerouslySetInnerHTML` en la pantalla de firma y en el PDF.
 */
export function fillContractTemplate(
  template: string,
  variables: Record<string, string>,
  name = 'Contrato'
): string {
  const htmlTemplate = compileStructuredTemplateToHtml(template, name)
  let filled = htmlTemplate
  for (const [key, value] of Object.entries(variables)) {
    filled = filled.replaceAll(`{{${key}}}`, escapeHtml(value))
  }
  // Variables que la plantilla declara pero nadie completó: no deben quedar
  // visibles como "{{algo}}" en un documento que el cliente va a firmar
  filled = filled.replace(/\{\{\s*[\w.]+\s*\}\}/g, '—')
  return filled
}

// ──────────────────────────────────────────
// MONTO EN LETRAS
// ──────────────────────────────────────────
// La versión anterior devolvía dígitos para todo valor ≥ 1.000.000, así que en
// la práctica casi ningún contrato en pesos imprimía el monto en letras. Además
// 150 daba "cien cincuenta" en lugar de "ciento cincuenta".

const UNITS = [
  '', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete',
  'dieciocho', 'diecinueve',
]
const TWENTIES = [
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve',
]
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = [
  '', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos',
]

/** 1–999 en palabras. */
function below1000(n: number): string {
  if (n <= 0) return ''
  if (n === 100) return 'cien'

  const h = Math.floor(n / 100)
  const r = n % 100
  const head = h > 0 ? HUNDREDS[h] : ''
  if (r === 0) return head

  let tail: string
  if (r < 20) tail = UNITS[r]
  else if (r < 30) tail = TWENTIES[r - 20]
  else {
    const u = r % 10
    tail = TENS[Math.floor(r / 10)] + (u > 0 ? ` y ${UNITS[u]}` : '')
  }
  return head ? `${head} ${tail}` : tail
}

/** Apócope del final: "veintiuno mil" → "veintiún mil", "uno millón" → "un millón". */
function apocope(text: string): string {
  if (text === 'uno') return 'un'
  if (text.endsWith('veintiuno')) return text.replace(/veintiuno$/, 'veintiún')
  return text.replace(/\buno$/, 'un')
}

/** 1–999.999 en palabras. */
function below1Million(n: number): string {
  const thousands = Math.floor(n / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (thousands === 1) parts.push('mil')
  else if (thousands > 1) parts.push(`${apocope(below1000(thousands))} mil`)
  if (rest > 0) parts.push(below1000(rest))
  return parts.join(' ')
}

/**
 * Convierte un número a texto en español, para el "monto en letras" del
 * contrato. Soporta hasta billones y devuelve los centavos como fracción
 * ("... con 50/100"), que es la forma habitual en instrumentos financieros.
 */
export function numberToWords(num: number): string {
  if (!Number.isFinite(num)) return 'cero'

  const negative = num < 0
  const abs = Math.abs(num)
  const intPart = Math.floor(abs)
  const cents = Math.round((abs - intPart) * 100)

  let words: string
  if (intPart === 0) {
    words = 'cero'
  } else {
    const parts: string[] = []
    const billions = Math.floor(intPart / 1_000_000_000_000)
    const millions = Math.floor((intPart % 1_000_000_000_000) / 1_000_000)
    const rest = intPart % 1_000_000

    if (billions === 1) parts.push('un billón')
    else if (billions > 1) parts.push(`${apocope(below1Million(billions))} billones`)

    if (millions === 1) parts.push('un millón')
    else if (millions > 1) parts.push(`${apocope(below1Million(millions))} millones`)

    if (rest > 0) parts.push(below1Million(rest))

    words = parts.join(' ')
  }

  if (cents > 0) words += ` con ${String(cents).padStart(2, '0')}/100`
  return (negative ? `menos ${words}` : words).trim()
}

/** Monto en letras con la moneda incluida, tal como va en el contrato. */
export function amountInWords(amount: number, currency: 'ARS' | 'USD' = 'ARS'): string {
  const unit = currency === 'ARS' ? 'pesos argentinos' : 'dólares estadounidenses'
  const singular = currency === 'ARS' ? 'peso argentino' : 'dólar estadounidense'
  const isOne = Math.floor(Math.abs(amount)) === 1
  return `${numberToWords(amount)} ${isOne ? singular : unit}`
}

/**
 * Verifica si el contrato está dentro de la ventana de decisión (a menos de 48 horas de expirar).
 */
export function isWithinDecisionWindow(contract: Contract): boolean {
  return isNearExpiration(contract, 48)
}

