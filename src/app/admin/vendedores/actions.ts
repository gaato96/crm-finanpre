'use server'

import { requireAdmin, getServiceClient as getAdminClient, AuthorizationError } from '@/lib/auth-guard'
import { checkPassword } from '@/lib/password'

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

    if (!data.email) return { error: 'El email es obligatorio.' }

    // Una cuenta de vendedor da acceso al panel: se le exige el mínimo reforzado
    const passwordCheck = checkPassword(data.password, true)
    if (!passwordCheck.valid) {
      return { error: passwordCheck.error ?? 'La contraseña no cumple los requisitos.' }
    }

    const supabase = getAdminClient()

    // El rol NO va en user_metadata: el trigger lo ignora (siempre crea
    // 'investor') y dejarlo ahí sugería que el metadata define privilegios.
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
      return { error: 'No se pudo obtener el ID del vendedor creado' }
    }

    // El upsert no necesita esperar al trigger: si el perfil ya existe lo
    // actualiza, y si todavía no, lo crea. El sleep de 500 ms era una carrera
    // disfrazada que igual podía fallar en un día lento.
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      full_name: data.full_name,
      cuit: data.cuit,
      phone: data.phone || null,
      email: data.email,
      role: 'vendedor',
    })

    if (profileError) {
      // Sin perfil la cuenta no sirve para nada: se revierte el alta
      await supabase.auth.admin.deleteUser(userId)
      if (/duplicate key|unique/i.test(profileError.message)) {
        return { error: 'Ese CUIT ya está registrado para otra persona.' }
      }
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
