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
    <div
      className="min-h-screen flex flex-col pb-20"
      style={{ background: 'linear-gradient(160deg, #080f1a 0%, #0a1628 60%, #080f1a 100%)' }}
    >
      {/* Top Header — full-width, content capped at 1140px */}
      <header
        className="sticky top-0 z-30 border-b border-white/5 px-4 py-3"
        style={{ background: 'rgba(8, 15, 26, 0.88)', backdropFilter: 'blur(20px)' }}
      >
        <div className="max-w-[1140px] mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg shrink-0"
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                boxShadow: '0 4px 14px rgba(59,130,246,0.35)',
              }}
            >
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold gradient-text leading-none tracking-widest uppercase">RENDIMAX</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Portal del Inversor</p>
            </div>
          </div>

          {/* User + logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-slate-200 leading-none">{profile?.full_name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Inversor</p>
            </div>
            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-muted-foreground hover:text-red-400"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content — capped at 1140px */}
      <main className="flex-1 px-4 py-6 max-w-[1140px] mx-auto w-full">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/5 safe-area-bottom"
        style={{ background: 'rgba(8, 15, 26, 0.94)', backdropFilter: 'blur(20px)' }}
      >
        <div className="max-w-[1140px] mx-auto flex">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const active = isActive(tab.href)
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-3 transition-all ${
                  active ? 'text-blue-400' : 'text-muted-foreground hover:text-slate-300'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-blue-400' : ''}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {active && (
                  <div
                    className="w-5 h-0.5 rounded-full mt-0.5"
                    style={{ background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
