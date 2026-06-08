import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Helper to resolve user role efficiently: JWT metadata first, then DB fallback
  const getUserRole = async (): Promise<string | null> => {
    if (!user) return null
    if (user.user_metadata?.role) {
      return user.user_metadata.role
    }
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()
      return profile?.role ?? null
    } catch {
      return null
    }
  }

  // Public routes
  if (pathname === '/login' || pathname === '/' || pathname.startsWith('/firmar') || pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/manifest') || pathname.startsWith('/sw') || pathname.startsWith('/icons')) {
    if (user && (pathname === '/login' || pathname === '/')) {
      const role = await getUserRole()
      if (role === 'admin' || role === 'vendedor') {
        return NextResponse.redirect(new URL('/admin', request.url))
      } else {
        return NextResponse.redirect(new URL('/portal', request.url))
      }
    }

    if (!user && pathname === '/') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    
    return supabaseResponse
  }

  // Not logged in - redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Check role-based access
  const role = await getUserRole()

  // Admin routes protection
  if (pathname.startsWith('/admin')) {
    if (role !== 'admin' && role !== 'vendedor') {
      return NextResponse.redirect(new URL('/portal', request.url))
    }

    // Limit seller access under /admin
    if (role === 'vendedor') {
      const isAllowedVendedorRoute =
        pathname === '/admin' ||
        pathname.startsWith('/admin/clientes') ||
        pathname.startsWith('/admin/contratos') ||
        pathname.startsWith('/admin/creditos')

      if (!isAllowedVendedorRoute) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
    }
  }

  // Portal routes protection
  if (pathname.startsWith('/portal')) {
    if (role === 'vendedor') {
      // Vendedores should be in the admin panel
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    // Admins are allowed to see portal if they want, but default redirect to admin is handled elsewhere
  }

  return supabaseResponse
}
