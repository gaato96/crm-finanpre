'use server'

import { requireAdmin, getServiceClient, AuthorizationError } from '@/lib/auth-guard'
import { checkPassword } from '@/lib/password'

/**
 * Restablece la contraseña de un cliente.
 * Requiere rol admin: sin esta verificación cualquiera podría invocar la acción
 * y cambiar la contraseña de cualquier usuario, incluido el administrador.
 */
export async function adminResetPassword(userId: string, newPassword: string) {
  try {
    await requireAdmin()

    if (!userId) return { error: 'Falta el usuario a modificar.' }
    const passwordCheck = checkPassword(newPassword)
    if (!passwordCheck.valid) {
      return { error: passwordCheck.error ?? 'La contraseña no cumple los requisitos.' }
    }

    const supabase = getServiceClient()

    // No se permite alterar la contraseña de otro administrador desde esta pantalla
    const { data: target } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (target?.role === 'admin') {
      return { error: 'No se puede cambiar la contraseña de otro administrador desde acá.' }
    }

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (error) return { error: error.message }

    return { success: true }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err?.message || 'Error desconocido del servidor' }
  }
}
