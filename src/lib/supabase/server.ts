import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    const dummyClient = createServerClient('https://dummy.supabase.co', 'dummy-key', { cookies: { getAll: () => [], setAll: () => {} } })
    // Fallback proxy to prevent build crashes in Next.js build step when environment variables are missing
    return new Proxy({} as any, {
      get(target, prop) {
        if (prop === 'auth') {
          return new Proxy({} as any, {
            get(authTarget, authProp) {
              return () => Promise.resolve({ data: { user: null }, error: null })
            }
          })
        }
        if (prop === 'from') {
          return () => new Proxy({} as any, {
            get(fromTarget, fromProp) {
              const handler = () => new Proxy({} as any, {
                get(methodTarget, methodProp) {
                  if (typeof methodProp === 'string' && ['order', 'limit', 'single', 'select', 'eq'].includes(methodProp)) {
                    return handler
                  }
                  return () => Promise.resolve({ data: null, error: null })
                }
              })
              return handler()
            }
          })
        }
        return () => Promise.resolve({ data: null, error: null })
      }
    }) as unknown as typeof dummyClient
  }

  const cookieStore = await cookies()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )
}
