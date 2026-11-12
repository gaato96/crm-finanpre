import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Canje del código de los enlaces de correo de Supabase (recuperación de
 * contraseña, confirmación de email) por una sesión con cookies.
 *
 * El cliente del navegador usa PKCE, así que el enlace llega con `?code=` y hay
 * que intercambiarlo del lado del servidor para que la cookie quede escrita
 * antes de redirigir.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/portal'

  // Sólo se admiten destinos internos: un `next` externo convertiría esta
  // ruta en un redirector abierto utilizable para phishing.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/portal'

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('El enlace no es válido o ya venció. Pedí uno nuevo.')}`
    )
  }

  // Flujo alternativo con token_hash (enlaces generados sin PKCE)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'recovery' | 'email' | 'signup' | 'invite' | 'email_change',
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`)
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('El enlace no es válido o ya venció. Pedí uno nuevo.')}`
    )
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('Falta el código de verificación en el enlace.')}`
  )
}
