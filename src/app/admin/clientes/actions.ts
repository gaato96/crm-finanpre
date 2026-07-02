'use server'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'La variable SUPABASE_SERVICE_ROLE_KEY no está configurada. ' +
      'Ve al panel de Supabase -> Project Settings -> API, ' +
      'copia la clave "service_role" y agrégala a tu archivo .env.local.'
    )
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

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
      return { error: profileError.message }
    }

    return { success: true, userId }
  } catch (err: any) {
    return { error: err.message || 'Error desconocido del servidor' }
  }
}

export async function generateCreditScoring(
  clientId: string,
  bcraRawReport: string,
  costOfLiving: number
) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    let result: { report: string; recommendation: string; limit: number }

    if (!geminiKey) {
      // Fallback/Simulación local if no key is configured
      const lines = bcraRawReport.split('\n')
      let totalDebt = 0
      let maxSit = 1
      for (const line of lines) {
        const matchSit = line.match(/\b(situaci[oó]n|sit|situacion)\b\D*([1-6])/i)
        if (matchSit) {
          const sitVal = parseInt(matchSit[2])
          if (sitVal > maxSit) maxSit = sitVal
        }
        const matchDebt = line.match(/\b\d+(?:\.\d+)?\b/)
        if (matchDebt) {
          totalDebt += parseFloat(matchDebt[0])
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
                text: `Actúa como un analista crediticio experto para la financiera FinanPRE. Analiza el siguiente informe de la Central de Deudores del Banco Central de la República Argentina (BCRA) y los datos de costo de vida provistos por el usuario, y genera un reporte detallado en formato Markdown, y un límite de crédito recomendado (número entero en pesos ARS).\n\nINFORME BCRA:\n${bcraRawReport}\n\nCOSTO DE VIDA MENSUAL DEL CLIENTE:\n$${costOfLiving} ARS\n\nEl reporte debe incluir:\n1. Resumen de la situación crediticia actual (entidades, montos de deuda y situaciones/clasificación del 1 al 6).\n2. Análisis del riesgo crediticio cruzando la deuda declarada con su costo de vida estimado.\n3. Recomendación explícita sobre si es conveniente prestarle y por qué.\n4. Límite de crédito sugerido (monto máximo habilitado a prestar en pesos).\n\nResponde estrictamente en formato JSON con la siguiente estructura (no envíes nada más, solo el objeto JSON):\n{\n  "report": "[Contenido del reporte en Markdown]",\n  "recommendation": "[Resumen de la recomendación en una línea]",\n  "limit": [Número entero con el monto máximo sugerido a prestar en ARS]\n}`
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

    return { success: true, result }
  } catch (err: any) {
    return { error: err.message || 'Error desconocido al generar scoring' }
  }
}
