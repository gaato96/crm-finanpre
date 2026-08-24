'use server'

import { requireAdmin, getServiceClient as getAdminClient, AuthorizationError } from '@/lib/auth-guard'

export async function adminCreateSeller(data: {
  email: string
  password: string
  full_name: string
  cuit: string
  phone?: string
}) {
  try {
    // Crear una cuenta de vendedor da acceso al panel: solo un admin puede hacerlo
    await requireAdmin()

    if (!data.email || !data.password || data.password.length < 8) {
      return { error: 'Email y contraseña (mínimo 8 caracteres) son obligatorios.' }
    }

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
    // then upsert to overwrite and set role/cuit/phone correctly.
    await new Promise(resolve => setTimeout(resolve, 500))

    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: data.full_name,
      cuit: data.cuit,
      phone: data.phone || null,
      email: data.email,
      role: 'vendedor',
    })

    if (profileError) {
      return { error: profileError.message }
    }

    return { success: true, userId }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err.message || 'Error desconocido del servidor' }
  }
}

export async function adminDeleteSeller(sellerId: string) {
  try {
    await requireAdmin()

    const supabase = getAdminClient()

    // Solo se admite borrar cuentas de vendedor desde esta pantalla
    const { data: target } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', sellerId)
      .single()

    if (target?.role !== 'vendedor') {
      return { error: 'Esta acción solo puede eliminar cuentas de vendedor.' }
    }

    // Delete auth user (cascades to public.profiles due to foreign key references ON DELETE CASCADE)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(sellerId)

    if (deleteError) {
      return { error: deleteError.message }
    }

    return { success: true }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err.message || 'Error al eliminar vendedor' }
  }
}
