import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn('⚠️ Supabase URL or Anon Key is missing. Using mock client to prevent build crash. Check Vercel environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
    }
    const dummyClient = createBrowserClient('https://dummy.supabase.co', 'dummy-key')
    // Fallback proxy to prevent build crashes in Next.js build step when environment variables are missing
    return new Proxy({} as any, {
      get(target, prop) {
        if (prop === 'auth') {
          return new Proxy({} as any, {
            get(authTarget, authProp) {
              if (authProp === 'onAuthStateChange') {
                return () => ({ data: { subscription: { unsubscribe: () => {} } } })
              }
              // Return a rejected promise or error for authentication attempts on mock client
              if (authProp === 'signInWithPassword') {
                return () => Promise.resolve({ data: {}, error: { message: 'Supabase no está configurado en Vercel. Por favor, añade las variables de entorno.' } })
              }
              return () => Promise.resolve({ data: { user: null }, error: null })
            }
          })
        }
        if (prop === 'from') {
          return () => new Proxy({} as any, {
            get(fromTarget, fromProp) {
              // Handle chaining like from().select().eq().single()
              const handler = () => new Proxy({} as any, {
                get(methodTarget, methodProp) {
                  if (typeof methodProp === 'string' && ['eq', 'select', 'order', 'limit', 'single'].includes(methodProp)) {
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

  return createBrowserClient(url, anonKey)
}
