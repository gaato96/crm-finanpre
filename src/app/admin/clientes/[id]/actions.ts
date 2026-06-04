'use server'

import { createClient } from '@supabase/supabase-js'

export async function adminResetPassword(userId: string, newPassword: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return {
      error: 'La variable SUPABASE_SERVICE_ROLE_KEY no está configurada. Para solucionarlo localmente: 1. Ve al panel de Supabase -> Project Settings -> API. 2. Copia la clave "service_role" en la sección "Project API keys". 3. Abre tu archivo .env.local en la raíz del proyecto y agrega: SUPABASE_SERVICE_ROLE_KEY=tu_clave_aqui. 4. Detén y reinicia el servidor Next.js en tu consola.',
    }
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (error) {
      return { error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Error desconocido del servidor' }
  }
}
