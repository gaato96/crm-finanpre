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
  dni: string
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
      dni: data.dni,
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
