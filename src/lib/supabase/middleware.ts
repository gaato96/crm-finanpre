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

  // Public routes
  if (pathname === '/login' || pathname === '/' || pathname.startsWith('/firmar') || pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/manifest') || pathname.startsWith('/sw') || pathname.startsWith('/icons')) {
    if (user && (pathname === '/login' || pathname === '/')) {
      // If logged in and on login or root page, check role and redirect
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role === 'admin') {
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Admin routes - only accessible by admins
  if (pathname.startsWith('/admin') && profile?.role !== 'admin') {
    return NextResponse.redirect(new URL('/portal', request.url))
  }

  // Portal routes - accessible by investors (and admins can also access)
  if (pathname.startsWith('/portal') && profile?.role === 'admin') {
    // Admins can view portal too, but by default redirect to admin
  }

  return supabaseResponse
}
