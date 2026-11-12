import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/auth-guard'

/**
 * Tareas diarias de la plataforma.
 *
 * Nada de esto corría: `check_and_reinvest_expired_contracts()` estaba definida
 * en la base desde la v9 pero no la llamaba nadie. En consecuencia la
 * reinversión automática que promete el contrato no ocurría, ningún contrato
 * pasaba nunca a 'vencido' y `credits.status = 'moroso'` no se escribía jamás,
 * así que el KPI de morosidad del panel era siempre 0.
 *
 * Lo ejecuta Vercel Cron (ver `vercel.json`) con el header
 * `Authorization: Bearer $CRON_SECRET`. Alternativamente se puede programar
 * `rendimax_run_daily_jobs()` con pg_cron dentro de Supabase; en ese caso esta
 * ruta queda como disparador manual.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const header = req.headers.get('authorization')
  if (header === `Bearer ${secret}`) return true

  // Vercel Cron manda este header en los planes donde no hay Authorization
  return req.headers.get('x-vercel-cron-secret') === secret
}

async function runJobs() {
  const admin = getServiceClient()
  const { data, error } = await admin.rpc('rendimax_run_daily_jobs')

  if (error) {
    console.error('[cron] rendimax_run_daily_jobs falló:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[cron] Tareas diarias completadas:', JSON.stringify(data))
  return NextResponse.json({ success: true, result: data })
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    // Sin CRON_SECRET configurado la ruta queda cerrada: es preferible que el
    // job no corra a que cualquiera pueda dispararlo desde internet.
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  return runJobs()
}

/** Mismo trabajo, para dispararlo a mano desde el panel. */
export async function POST(req: NextRequest) {
  if (isAuthorized(req)) return runJobs()

  // Un administrador autenticado también puede forzar la corrida
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = getServiceClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  return runJobs()
}
