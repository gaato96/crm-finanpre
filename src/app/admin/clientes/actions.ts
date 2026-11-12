'use server'

import {
  requireStaff,
  requireAdmin,
  getServiceClient as getAdminClient,
  AuthorizationError,
} from '@/lib/auth-guard'
import { checkPassword } from '@/lib/password'

export async function adminCreateClient(data: {
  email: string
  password: string
  full_name: string
  cuit: string
  phone?: string
  address?: string
  client_type: string
  trust_level: number
  notes?: string
}) {
  try {
    // Alta de clientes: solo personal autorizado (admin o vendedor)
    await requireStaff()

    if (!data.email) return { error: 'El email es obligatorio.' }

    // Misma política que el registro público y el cambio de contraseña
    const passwordCheck = checkPassword(data.password)
    if (!passwordCheck.valid) {
      return { error: passwordCheck.error ?? 'La contraseña no cumple los requisitos.' }
    }

    const supabase = getAdminClient()

    // Create auth user with email already confirmed (no verification email needed)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    })

    if (authError) {
      return { error: authError.message }
    }

    const userId = authData.user?.id
    if (!userId) {
      return { error: 'No se pudo obtener el ID del usuario creado' }
    }

    // Upsert profile with all client data
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: data.full_name,
      cuit: data.cuit,
      phone: data.phone || null,
      email: data.email,
      address: data.address || null,
      notes: data.notes || null,
      role: 'investor',
      client_type: data.client_type,
      trust_level: data.trust_level,
    })

    if (profileError) {
      // Sin perfil la cuenta es inservible: puede loguearse pero no opera y
      // queda rebotando sin explicación. Se revierte el alta.
      await supabase.auth.admin.deleteUser(userId)
      if (/duplicate key|unique/i.test(profileError.message)) {
        return { error: 'Ese CUIT ya está registrado para otro cliente.' }
      }
      return { error: profileError.message }
    }

    return { success: true, userId }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err.message || 'Error desconocido del servidor' }
  }
}

/**
 * Edición de los datos de un cliente.
 *
 * Antes la pantalla actualizaba `profiles` directamente desde el navegador: el
 * email cambiaba en la tabla pero no en `auth.users`, así que el cliente seguía
 * logueándose con el viejo mientras los correos salían al nuevo.
 */
export async function adminUpdateClient(
  clientId: string,
  data: {
    full_name: string
    cuit: string
    phone?: string
    email?: string
    address?: string
    client_type: string
    trust_level: number
    notes?: string
  }
) {
  try {
    await requireStaff()

    const supabase = getAdminClient()

    const fullName = data.full_name?.trim()
    const cuit = data.cuit?.trim()
    const email = data.email?.trim().toLowerCase() || null

    if (!fullName) return { error: 'El nombre no puede quedar vacío.' }
    if (!cuit) return { error: 'El CUIT no puede quedar vacío.' }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'El email no tiene un formato válido.' }
    }

    // Esta pantalla gestiona clientes: no debe poder tocar cuentas del panel
    const { data: target } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', clientId)
      .single()

    if (!target) return { error: 'No se encontró el cliente.' }
    if (target.role !== 'investor') {
      return { error: 'Desde acá sólo se editan cuentas de cliente.' }
    }

    // El email vive en auth.users: si cambia, hay que actualizarlo ahí también
    if (email) {
      const { data: authUser } = await supabase.auth.admin.getUserById(clientId)
      if (authUser?.user && authUser.user.email?.toLowerCase() !== email) {
        const { error: authError } = await supabase.auth.admin.updateUserById(clientId, {
          email,
          email_confirm: true,
        })
        if (authError) {
          return { error: 'No se pudo cambiar el email de acceso: ' + authError.message }
        }
      }
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        cuit,
        phone: data.phone?.trim() || null,
        email,
        address: data.address?.trim() || null,
        client_type: data.client_type,
        trust_level: data.trust_level,
        notes: data.notes?.trim() || null,
      })
      .eq('id', clientId)

    if (error) {
      if (/duplicate key|unique/i.test(error.message)) {
        return { error: 'Ese CUIT ya pertenece a otro cliente.' }
      }
      return { error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err?.message || 'Error desconocido del servidor' }
  }
}

/**
 * Baja definitiva de un cliente.
 *
 * Borra en cascada contratos, créditos, cuotas y eventos. Se exige rol admin y
 * se informa de antemano qué se va a perder: antes alcanzaba con un `confirm()`
 * del navegador para borrar el historial financiero completo de una persona.
 */
export async function adminDeleteClient(clientId: string) {
  try {
    await requireAdmin()

    const supabase = getAdminClient()

    const { data: target } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', clientId)
      .single()

    if (!target) return { error: 'No se encontró el cliente.' }
    if (target.role !== 'investor') {
      return { error: 'Esta acción sólo elimina cuentas de cliente.' }
    }

    const { error } = await supabase.auth.admin.deleteUser(clientId)
    if (error) return { error: error.message }

    return { success: true }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err?.message || 'Error al eliminar el cliente' }
  }
}

/**
 * Qué se va a borrar junto con el cliente, para poder avisarlo antes.
 */
export async function getClientDeletionImpact(clientId: string) {
  try {
    await requireAdmin()
    const supabase = getAdminClient()

    const [contracts, credits, activeContracts, pendingInstallments] = await Promise.all([
      supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('credits').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase
        .from('contracts')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .in('status', ['activo', 'retiro_solicitado', 'en_consignacion', 'pendiente_fondos']),
      supabase
        .from('credits')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .in('status', ['vigente', 'moroso']),
    ])

    return {
      contracts: contracts.count ?? 0,
      credits: credits.count ?? 0,
      activeContracts: activeContracts.count ?? 0,
      activeCredits: pendingInstallments.count ?? 0,
    }
  } catch {
    return { contracts: 0, credits: 0, activeContracts: 0, activeCredits: 0 }
  }
}

export async function generateCreditScoring(
  clientId: string,
  bcraRawReport: string,
  costOfLiving: number
) {
  try {
    await requireStaff()

    const geminiKey = process.env.GEMINI_API_KEY
    let result: { report: string; recommendation: string; limit: number }
    // Se informa a la pantalla si el análisis salió del motor de reglas
    let usedFallback = false

    if (!geminiKey) {
      usedFallback = true
      // Motor de reglas local, cuando no hay clave de IA configurada.
      //
      // La versión anterior sumaba el PRIMER número de cada línea, fuera lo que
      // fuera: años, números de cuenta, códigos de entidad. El total de deuda
      // que salía de ahí no significaba nada. Ahora sólo se consideran importes
      // con formato de monto (separador de miles o decimales) y se descartan
      // los valores que claramente no lo son.
      const lines = bcraRawReport.split('\n')
      let totalDebt = 0
      let maxSit = 1

      for (const line of lines) {
        const matchSit = line.match(/\b(situaci[oó]n|sit\.?|situacion)\b\D{0,10}([1-6])\b/i)
        if (matchSit) {
          const sitVal = parseInt(matchSit[2], 10)
          if (sitVal > maxSit) maxSit = sitVal
        }

        // Importes al estilo argentino: 1.234.567,89 · 1234567,89 · $ 45.000
        const amounts = line.match(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}/g)
        if (!amounts) continue

        for (const raw of amounts) {
          const value = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
          // Un año suelto (1900-2100) no es un importe; tampoco los centavos sueltos
          if (!Number.isFinite(value) || value < 1000) continue
          if (value >= 1900 && value <= 2100 && !raw.includes('.')) continue
          totalDebt += value
        }
      }

      // Rule-based credit scoring estimation
      let baseLimit = 2500000 // 2.5M ARS default
      if (maxSit >= 4) {
        baseLimit = 0
      } else if (maxSit === 3) {
        baseLimit = 400000
      } else if (maxSit === 2) {
        baseLimit = 1000000
      }
      
      const allowedLend = Math.max(0, baseLimit - (costOfLiving * 0.4) - (totalDebt * 0.1))

      result = {
        report: `### Reporte Analítico de Crédito (Simulado - Sin GEMINI_API_KEY)\n\n*   **Estado de Situación Máxima:** ${maxSit} (${maxSit === 1 ? 'Normal' : maxSit === 2 ? 'Seguimiento Especial' : maxSit === 3 ? 'Problemas' : 'Alto Riesgo'})\n*   **Deuda Total en Sistema Financiero (Est.):** $${totalDebt.toLocaleString('es-AR')} ARS\n*   **Costo de Vida Declarado:** $${costOfLiving.toLocaleString('es-AR')} ARS\n\n#### Análisis Crediticio\nEl cliente presenta un comportamiento de pago general clasificado como **Situación ${maxSit}**. Considerando sus gastos mensuales de subsistencia y deudas bancarias estimadas, se sugiere un perfil de riesgo moderado.\n\n#### Conclusión y Límite Recomendado\nSe sugiere limitar el otorgamiento de crédito para mantener un índice de endeudamiento sano.`,
        recommendation: maxSit >= 3 ? 'No recomendado por situación de mora en Central deudores' : 'Recomendado con límites moderados',
        limit: Math.round(allowedLend)
      }
    } else {
      // Call Gemini API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Actúa como un analista crediticio experto para la financiera RENDIMAX. Analiza el siguiente informe de la Central de Deudores del Banco Central de la República Argentina (BCRA) y los datos de costo de vida provistos por el usuario, y genera un reporte detallado en formato Markdown, y un límite de crédito recomendado (número entero en pesos ARS).\n\nINFORME BCRA:\n${bcraRawReport}\n\nCOSTO DE VIDA MENSUAL DEL CLIENTE:\n$${costOfLiving} ARS\n\nEl reporte debe incluir:\n1. Resumen de la situación crediticia actual (entidades, montos de deuda y situaciones/clasificación del 1 al 6).\n2. Análisis del riesgo crediticio cruzando la deuda declarada con su costo de vida estimado.\n3. Recomendación explícita sobre si es conveniente prestarle y por qué.\n4. Límite de crédito sugerido (monto máximo habilitado a prestar en pesos).\n\nResponde estrictamente en formato JSON con la siguiente estructura (no envíes nada más, solo el objeto JSON):\n{\n  "report": "[Contenido del reporte en Markdown]",\n  "recommendation": "[Resumen de la recomendación en una línea]",\n  "limit": [Número entero con el monto máximo sugerido a prestar en ARS]\n}`
              }]
            }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          })
        }
      )

      if (!response.ok) {
        throw new Error(`Error de Gemini API: ${response.status} - ${response.statusText}`)
      }

      const resData = await response.json()
      const text = resData.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) {
        throw new Error('No se recibió respuesta válida del modelo de IA')
      }

      // Cleanup response text if markdown wrapper was returned
      const cleanText = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
      result = JSON.parse(cleanText)
    }

    // Save to profiles database using Admin Client
    const supabase = getAdminClient()
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        bcra_raw_report: bcraRawReport,
        cost_of_living: costOfLiving,
        credit_scoring_report: result.report,
        credit_scoring_recommendation: result.recommendation,
        credit_scoring_limit: result.limit,
        credit_scoring_updated_at: new Date().toISOString()
      })
      .eq('id', clientId)

    if (profileError) {
      return { error: `Error al guardar en base de datos: ${profileError.message}` }
    }

    return { success: true, result, usedFallback }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err.message || 'Error desconocido al generar scoring' }
  }
}
