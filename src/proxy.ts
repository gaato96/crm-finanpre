import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/session'

// Next.js 16 renombró la convención `middleware` a `proxy` (misma funcionalidad).
// La autorización real la aplica RLS en Supabase; esto solo enruta por rol.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (icons, manifest, sw)
     */
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
