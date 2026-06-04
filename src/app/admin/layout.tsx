'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  LayoutDashboard,
  Users,
  Landmark,
  CreditCard,
  TrendingUp,
  LogOut,
  Menu,
  X,
  ChevronRight,
  FileText,
  Package,
} from 'lucide-react'

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/admin/inversiones', label: 'Inversiones', icon: TrendingUp },
  { href: '/admin/contratos', label: 'Contratos', icon: FileText },
  { href: '/admin/creditos', label: 'Créditos', icon: CreditCard },
  { href: '/admin/activos', label: 'Activos Disponibles', icon: Package },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { profile, signOut, loading } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-sidebar border-r border-sidebar-border z-50 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="p-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-accent to-emerald-dim flex items-center justify-center shadow-lg shadow-emerald-accent/20 shrink-0">
            <Landmark className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold gradient-text leading-tight">FinanPre</h1>
            <p className="text-[10px] text-muted-foreground leading-none">Panel Administrativo</p>
          </div>
          <button className="ml-auto lg:hidden text-muted-foreground" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary/60 shrink-0" />}
              </Link>
            )
          })}
        </nav>

        <Separator className="bg-sidebar-border" />

        {/* User section */}
        <div className="p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-8 w-8 border border-primary/30 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'AD'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.full_name || 'Administrador'}</p>
              <p className="text-xs text-muted-foreground">Administrador</p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full mt-1 justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-9"
          >
            <LogOut className="w-4 h-4" />
            Cerrar Sesión
          </Button>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center gap-4 px-4 lg:px-6">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-accent transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-tight">{profile?.full_name}</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
            <Avatar className="h-8 w-8 border border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {profile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'AD'}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
