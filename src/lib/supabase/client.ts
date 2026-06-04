import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If env vars are missing (e.g., during build or misconfiguration),
  // return a safe mock that resolves auth calls without hanging forever.
  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.error(
        '❌ NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from the browser bundle. ' +
        'Make sure these are set in Vercel BEFORE building. Redeploy if you just added them.'
      )
    }

    // Create a real-looking mock that resolves immediately so the app never hangs
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        getUser: () => Promise.resolve({ data: { user: null }, error: null }),
        signInWithPassword: () =>
          Promise.resolve({
            data: { user: null, session: null },
            error: { message: 'Variables de entorno de Supabase no configuradas. Contacta al administrador.' },
          }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: (callback: (event: string, session: null) => void) => {
          // Call immediately with null session so loading resolves
          setTimeout(() => callback('INITIAL_SESSION', null), 0)
          return { data: { subscription: { unsubscribe: () => {} } } }
        },
      },
      from: (_table: string) => ({
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      }),
    } as any
  }

  return createBrowserClient(url, anonKey)
}
