'use server'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'La variable SUPABASE_SERVICE_ROLE_KEY no está configurada.'
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

export async function adminCreateSeller(data: {
  email: string
  password: string
  full_name: string
  dni: string
  phone?: string
}) {
  try {
    const supabase = getAdminClient()

    // Create auth user with vendedor role in metadata
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { 
        full_name: data.full_name,
        role: 'vendedor' 
      },
    })

    if (authError) {
      return { error: authError.message }
    }

    const userId = authData.user?.id
    if (!userId) {
      return { error: 'No se pudo obtener el ID del vendedor creado' }
    }

    // Wait a brief moment for the trigger to insert the basic profile,
    // then upsert to overwrite and set role/dni/phone correctly.
    await new Promise(resolve => setTimeout(resolve, 500))

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: data.full_name,
      dni: data.dni,
      phone: data.phone || null,
      email: data.email,
      role: 'vendedor',
    })

    if (profileError) {
      return { error: profileError.message }
    }

    return { success: true, userId }
  } catch (err: any) {
    return { error: err.message || 'Error desconocido del servidor' }
  }
}

export async function adminDeleteSeller(sellerId: string) {
  try {
    const supabase = getAdminClient()

    // Delete auth user (cascades to public.profiles due to foreign key references ON DELETE CASCADE)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(sellerId)

    if (deleteError) {
      return { error: deleteError.message }
    }

    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Error al eliminar vendedor' }
  }
}
