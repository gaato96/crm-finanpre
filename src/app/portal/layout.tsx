'use client'

import { type ReactNode, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import { Home, BarChart3, FileText, LogOut, TrendingUp } from 'lucide-react'

const tabs = [
  { href: '/portal', label: 'Inicio', icon: Home },
  { href: '/portal/inversiones', label: 'Inversiones', icon: BarChart3 },
  { href: '/portal/documentos', label: 'Documentos', icon: FileText },
]

export default function PortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, signOut, loading } = useAuth()

  // Guard: if an admin somehow reaches /portal, redirect to /admin
  useEffect(() => {
    if (!loading && (profile?.role === 'admin' || profile?.role === 'vendedor')) {
      router.replace('/admin')
    }
  }, [loading, profile, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const isActive = (href: string) => {
    if (href === '/portal') return pathname === '/portal'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen flex flex-col pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-accent to-emerald-dim flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold gradient-text leading-none">FinanPre</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Portal del Inversor</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium">{profile?.full_name}</p>
            </div>
            <button onClick={signOut} className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-destructive">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full">
        {children}
      </main>

      {/* Bottom Tab Bar (Mobile native feel) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border/50 safe-area-bottom">
        <div className="max-w-lg mx-auto flex">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-3 transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-primary' : ''}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
