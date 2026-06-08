'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Create client inside effect to avoid SSR issues
    const supabase = createClient()

    const fetchProfile = async (userId: string) => {
      const fetchPromise = async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (error) {
          console.warn('Profile fetch warning (could be RLS issue):', error.message)
          throw error
        }
        return data
      }

      try {
        const data = await Promise.race([
          fetchPromise(),
          new Promise<any>((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
          )
        ])
        setProfile(data)
      } catch (err) {
        console.error('Error or timeout fetching profile:', err)
        setProfile(null)
      }
    }

    // Step 1: Use getSession() to read the local session immediately.
    // This reads from browser cookies/localStorage — no network request needed.
    // This is what resolves the loading state fast.
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await fetchProfile(currentUser.id)
        }
      } catch (err) {
        console.error('Auth init error:', err)
        setUser(null)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    // Step 2: Subscribe to future auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: any, session: any) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (currentUser) {
          await fetchProfile(currentUser.id)
        } else {
          setProfile(null)
        }
        // Always resolve loading in case initAuth didn't finish first
        setLoading(false)
      }
    )

    // Register service worker for PWA
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Ignore SW registration errors silently
      })
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
