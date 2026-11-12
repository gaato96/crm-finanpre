'use server'

import { getServiceClient, getCurrentUser } from '@/lib/auth-guard'
import { adjustToNextBusinessDay } from '@/lib/helpers'

/** Días antes del vencimiento en los que ya no se admite solicitud de retiro. */
const WITHDRAWAL_LOCK_DAYS = 12
const MIN_INVESTMENT_ARS = 100_000
const MIN_INVESTMENT_USD = 100
/** Contratos sin firmar que un inversor puede tener abiertos a la vez. */
const MAX_PENDING_CONTRACTS = 3

/** Devuelve el usuario autenticado a partir de la cookie de sesión. */
async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error('Sesión expirada. Volvé a iniciar sesión.')
  return user
}

function daysUntil(dateStr: string): number {
  const end = new Date(dateStr + 'T12:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Solicitud de retiro por parte del inversor.
 * Valida la titularidad del contrato, su estado y la ventana de bloqueo,
 * cosas que el navegador no puede garantizar por sí solo.
 */
export async function requestWithdrawal(contractId: string) {
  try {
    const user = await requireUser()
    const admin = getServiceClient()

    const { data: contract, error } = await admin
      .from('contracts')
      .select('id, client_id, status, end_date, kind, currency')
      .eq('id', contractId)
      .single()

    if (error || !contract) return { error: 'No se encontró la inversión solicitada.' }
    if (contract.client_id !== user.id) return { error: 'Esta inversión no te pertenece.' }
    // Un contrato de crédito no se "retira": es deuda del cliente, no capital suyo
    if (contract.kind !== 'inversion') {
      return { error: 'Este contrato no corresponde a una inversión.' }
    }
    if (contract.status !== 'activo') {
      return { error: 'Solo se puede solicitar el retiro de una inversión activa.' }
    }

    const remaining = daysUntil(contract.end_date)
    if (remaining <= WITHDRAWAL_LOCK_DAYS) {
      return {
        error: `No se puede solicitar el retiro faltando ${WITHDRAWAL_LOCK_DAYS} días o menos para el vencimiento (quedan ${remaining}).`,
      }
    }

    // Monto devengado al momento de pedir el retiro: queda registrado para que
    // después se pueda auditar contra lo que efectivamente se pagó.
    const { data: accrued } = await admin.rpc('contract_accrued_capital', {
      p_contract_id: contractId,
    })

    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .from('contracts')
      .update({
        status: 'retiro_solicitado',
        withdrawal_requested_at: now,
        withdrawal_requested_amount: accrued ?? null,
        withdrawal_type: 'total',
      })
      .eq('id', contractId)

    if (updateError) return { error: updateError.message }

    await admin.from('contract_events').insert({
      contract_id: contractId,
      event_type: 'withdrawal_requested',
      metadata: { requested_at: now, source: 'portal', accrued_amount: accrued ?? null },
    })

    return { success: true, amount: accrued ?? null }
  } catch (err: any) {
    return { error: err?.message || 'Error inesperado al procesar la solicitud.' }
  }
}

/**
 * Alta de inversión autogestionada desde el portal.
 * La tasa se toma de la configuración del sistema en el servidor: el cliente
 * nunca decide su propio rendimiento.
 */
export async function createSelfServiceInvestment(input: {
  currency: 'ARS' | 'USD'
  capital: number
  startDate: string
}) {
  try {
    const user = await requireUser()
    const admin = getServiceClient()

    const { currency, capital, startDate } = input

    if (currency !== 'ARS' && currency !== 'USD') {
      return { error: 'Moneda inválida.' }
    }
    if (!Number.isFinite(capital) || capital <= 0) {
      return { error: 'El capital a invertir debe ser un monto válido.' }
    }
    const minimum = currency === 'ARS' ? MIN_INVESTMENT_ARS : MIN_INVESTMENT_USD
    if (capital < minimum) {
      return { error: `El capital mínimo para invertir en ${currency} es ${minimum.toLocaleString('es-AR')}.` }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return { error: 'La fecha de inicio no es válida.' }
    }

    // No se admiten inversiones retroactivas ni con más de 30 días de anticipación
    const start = new Date(startDate + 'T12:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.round((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return { error: 'La fecha de inicio no puede ser anterior a hoy.' }
    if (diffDays > 30) return { error: 'La fecha de inicio no puede superar los 30 días desde hoy.' }

    // Tope de contratos sin firmar: sin esto el portal permitía generar
    // contratos pendientes sin límite y ensuciar la cartera del administrador.
    const { count: pendingCount } = await admin
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.id)
      .eq('kind', 'inversion')
      .in('status', ['borrador', 'enviado'])

    if ((pendingCount ?? 0) >= MAX_PENDING_CONTRACTS) {
      return {
        error:
          'Ya tenés inversiones pendientes de firma. Completá o cancelá esas antes de generar otra.',
      }
    }

    // Tasa vigente definida por el administrador
    const { data: yieldSetting } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'monthly_yield_config')
      .maybeSingle()

    const rates = (yieldSetting?.value ?? {}) as { ars_monthly_rate?: number; usd_monthly_rate?: number }
    const monthlyRate = currency === 'ARS' ? (rates.ars_monthly_rate ?? 8.5) : (rates.usd_monthly_rate ?? 5.0)

    // Plantilla de inversión activa
    const { data: template } = await admin
      .from('contract_templates')
      .select('id')
      .eq('type', 'inversion')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()

    const end = new Date(start)
    end.setDate(end.getDate() + 30)
    const endDate = adjustToNextBusinessDay(end.toISOString().split('T')[0])

    const { data: contract, error: insertError } = await admin
      .from('contracts')
      .insert({
        client_id: user.id,
        kind: 'inversion',
        initial_capital: capital,
        current_capital: capital,
        currency,
        monthly_rate: monthlyRate,
        start_date: startDate,
        end_date: endDate,
        status: 'enviado',
        template_id: template?.id ?? null,
      })
      .select('id, sign_token')
      .single()

    if (insertError) return { error: insertError.message }

    await admin.from('contract_events').insert({
      contract_id: contract.id,
      event_type: 'sent',
      metadata: { client_created: true, source: 'portal' },
    })

    return { success: true, signToken: contract.sign_token, monthlyRate, endDate }
  } catch (err: any) {
    return { error: err?.message || 'Error inesperado al generar el contrato.' }
  }
}
