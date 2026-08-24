'use server'

import { createClient as createBrowserlessClient } from '@supabase/supabase-js'
import { requireStaff, getServiceClient, AuthorizationError } from '@/lib/auth-guard'

/**
 * Actualiza los datos de la propia cuenta (admin o vendedor).
 * Siempre opera sobre el usuario de la sesión: nunca recibe un id por parámetro,
 * así no puede usarse para editar la cuenta de otra persona.
 */
export async function updateMyProfile(input: {
  full_name: string
  cuit: string
  phone?: string
  address?: string
  email?: string
}) {
  try {
    const { userId } = await requireStaff()
    const admin = getServiceClient()

    const fullName = input.full_name?.trim()
    const cuit = input.cuit?.trim()
    const email = input.email?.trim().toLowerCase()

    if (!fullName) return { error: 'El nombre no puede quedar vacío.' }
    if (!cuit) return { error: 'El CUIT no puede quedar vacío.' }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: 'El email no tiene un formato válido.' }
    }

    // El email vive en auth.users; se actualiza ahí y se refleja en el perfil
    if (email) {
      const { data: authUser } = await admin.auth.admin.getUserById(userId)
      if (authUser?.user && authUser.user.email?.toLowerCase() !== email) {
        const { error: authError } = await admin.auth.admin.updateUserById(userId, {
          email,
          email_confirm: true,
        })
        if (authError) return { error: 'No se pudo cambiar el email: ' + authError.message }
      }
    }

    const { error } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        cuit,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
        ...(email ? { email } : {}),
      })
      .eq('id', userId)

    if (error) return { error: error.message }

    return { success: true }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err?.message || 'Error inesperado al guardar los datos.' }
  }
}

/**
 * Cambia la contraseña propia.
 * Exige la contraseña actual: si alguien deja la sesión abierta en un equipo
 * ajeno, no alcanza con eso para quedarse con la cuenta.
 */
export async function changeMyPassword(currentPassword: string, newPassword: string) {
  try {
    const { userId } = await requireStaff()

    if (!newPassword || newPassword.length < 10) {
      return { error: 'La contraseña nueva debe tener al menos 10 caracteres.' }
    }
    if (currentPassword === newPassword) {
      return { error: 'La contraseña nueva debe ser distinta de la actual.' }
    }

    const admin = getServiceClient()
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) return { error: 'La cuenta no tiene email asociado.' }

    // Verificación de la contraseña actual con un cliente aislado (sin sesión persistida)
    const verifier = createBrowserlessClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email,
      password: currentPassword,
    })
    if (signInError) return { error: 'La contraseña actual no es correcta.' }

    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) return { error: error.message }

    return { success: true }
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err?.message || 'Error inesperado al cambiar la contraseña.' }
  }
}
