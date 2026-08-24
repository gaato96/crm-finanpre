// Solo debe importarse desde archivos 'use server' o Server Components.
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Las server actions de Next.js son endpoints HTTP públicos: cualquiera que
 * conozca su identificador (visible en el bundle del navegador) puede invocarlas.
 * Por eso TODA acción administrativa debe verificar acá quién está llamando,
 * y nunca confiar en que la pantalla que la invoca esté protegida.
 */

export class AuthorizationError extends Error {
  constructor(message = 'No tenés permisos para realizar esta acción.') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/** Cliente con clave de servicio: omite RLS, usar solo después de validar el rol. */
export function getServiceClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error(
      'La variable SUPABASE_SERVICE_ROLE_KEY no está configurada. ' +
      'Cargala en Vercel (Project Settings → Environment Variables) o en .env.local.'
    )
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Usuario autenticado según la cookie de sesión, o null. */
export async function getCurrentUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * Rol real del usuario leído de `profiles`.
 * Nunca se usa `user_metadata`: el propio usuario puede editarlo con auth.updateUser.
 */
export async function getCurrentRole(): Promise<{ userId: string; role: string } | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const admin = getServiceClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile?.role) return null
  return { userId: user.id, role: profile.role }
}

/** Exige rol admin. Lanza AuthorizationError si no lo es. */
export async function requireAdmin(): Promise<{ userId: string; role: string }> {
  const current = await getCurrentRole()
  if (!current) throw new AuthorizationError('Sesión expirada. Volvé a iniciar sesión.')
  if (current.role !== 'admin') {
    throw new AuthorizationError('Esta acción solo puede realizarla un administrador.')
  }
  return current
}

/** Exige rol admin o vendedor (operaciones de gestión comercial). */
export async function requireStaff(): Promise<{ userId: string; role: string }> {
  const current = await getCurrentRole()
  if (!current) throw new AuthorizationError('Sesión expirada. Volvé a iniciar sesión.')
  if (current.role !== 'admin' && current.role !== 'vendedor') {
    throw new AuthorizationError('Esta acción solo puede realizarla el personal autorizado.')
  }
  return current
}

/** Envuelve una acción devolviendo `{ error }` en vez de propagar la excepción. */
export async function guarded<T>(
  guard: () => Promise<unknown>,
  fn: () => Promise<T>
): Promise<T | { error: string }> {
  try {
    await guard()
    return await fn()
  } catch (err: any) {
    if (err instanceof AuthorizationError) return { error: err.message }
    return { error: err?.message || 'Error inesperado del servidor.' }
  }
}
