'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, isNearExpiration, daysRemaining } from '@/lib/helpers'
import type { Contract, Credit, AssetValuation } from '@/lib/types'
import {
  DollarSign,
  TrendingUp,
  Clock,
  AlertTriangle,
  ArrowRight,
  Wallet,
  BarChart3,
  Users,
  CreditCard,
} from 'lucide-react'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface DashboardData {
  contracts: (Contract & { profiles: { full_name: string; id: string } })[]
  credits: (Credit & { profiles: { full_name: string } })[]
  assets: AssetValuation[]
  totalClients: number
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const [contractsRes, creditsRes, assetsRes, clientsRes] = await Promise.all([
        supabase.from('contracts').select('*, profiles(full_name, id)').order('end_date', { ascending: true }),
        supabase.from('credits').select('*, profiles(full_name)'),
        supabase.from('assets_valuation').select('*'),
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'investor'),
      ])

      setData({
        contracts: (contractsRes.data || []) as DashboardData['contracts'],
        credits: (creditsRes.data || []) as DashboardData['credits'],
        assets: assetsRes.data || [],
        totalClients: clientsRes.count || 0,
      })
      setLoading(false)
    }

    fetchData()
  }, [])

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const activeContracts = data.contracts.filter(c => c.status === 'activo')
  const liquidezARS = activeContracts.filter(c => c.currency === 'ARS').reduce((s, c) => s + Number(c.initial_capital), 0)
  const liquidezUSD = activeContracts.filter(c => c.currency === 'USD').reduce((s, c) => s + Number(c.initial_capital), 0)
  const nearExpiration = activeContracts.filter(c => isNearExpiration(c))
  const totalCreditos = data.credits.filter(c => c.status === 'vigente').reduce((s, c) => s + Number(c.total_amount), 0)
  const morosCount = data.credits.filter(c => c.status === 'moroso').length
  const morosPct = data.credits.length > 0 ? (morosCount / data.credits.length) * 100 : 0

  // Chart data: capital by category (from actual contract data)
  const capitalARS = activeContracts.filter(c => c.currency === 'ARS').reduce((s, c) => s + Number(c.initial_capital), 0)
  const capitalUSD = activeContracts.filter(c => c.currency === 'USD').reduce((s, c) => s + Number(c.initial_capital), 0)
  const creditosVigentes = data.credits.filter(c => c.status === 'vigente').reduce((s, c) => s + Number(c.total_amount), 0)
  const creditosMorosos = data.credits.filter(c => c.status === 'moroso').reduce((s, c) => s + Number(c.total_amount), 0)

  const assetBreakdown = [
    { name: 'Inv. Pesos', value: capitalARS, color: '#10b981' },
    { name: 'Inv. Dólares', value: capitalUSD, color: '#3b82f6' },
    { name: 'Créditos Vigentes', value: creditosVigentes, color: '#f59e0b' },
    { name: 'Créditos Morosos', value: creditosMorosos, color: '#ef4444' },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">Dashboard Global</h1>
        <p className="text-muted-foreground mt-1">Resumen en tiempo real de la operación financiera</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Liquidez Total */}
        <Card className="card-hover glass-card">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Liquidez Total</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-emerald-accent/30 text-emerald-glow">ARS</Badge>
                    <span className="text-lg font-bold">{formatCurrency(liquidezARS, 'ARS')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs border-blue-400/30 text-blue-400">USD</Badge>
                    <span className="text-lg font-bold">{formatCurrency(liquidezUSD, 'USD')}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inversiones Activas */}
        <Card className="card-hover glass-card">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inversiones Activas</p>
                <p className="text-3xl font-bold mt-2 gradient-text">{activeContracts.length}</p>
                <p className="text-xs text-muted-foreground mt-1">contratos vigentes</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Próximos Vencimientos */}
        <Card className={`card-hover glass-card ${nearExpiration.length > 0 ? 'border-amber-500/30' : ''}`}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Próximos Vencimientos</p>
                <p className={`text-3xl font-bold mt-2 ${nearExpiration.length > 0 ? 'text-amber-400' : ''}`}>
                  {nearExpiration.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">en próximas 48hs</p>
              </div>
              <div className={`p-3 rounded-xl ${nearExpiration.length > 0 ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                <Clock className={`w-5 h-5 ${nearExpiration.length > 0 ? 'text-amber-400' : 'text-primary'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado de Créditos */}
        <Card className={`card-hover glass-card ${morosPct > 0 ? 'border-destructive/30' : ''}`}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Créditos Colocados</p>
                <p className="text-2xl font-bold mt-2">{formatCurrency(totalCreditos, 'ARS')}</p>
                <p className={`text-xs mt-1 ${morosPct > 0 ? 'text-destructive' : 'text-emerald-glow'}`}>
                  {morosPct > 0 ? `⚠ ${morosPct.toFixed(0)}% morosidad` : '✓ Sin morosidad'}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${morosPct > 0 ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                <DollarSign className={`w-5 h-5 ${morosPct > 0 ? 'text-destructive' : 'text-primary'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts + Alerts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bar Chart - Capital by Category */}
        <Card className="lg:col-span-3 glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Capital Operativo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {assetBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={assetBreakdown} barSize={48}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    contentStyle={{
                      background: 'rgba(30, 41, 59, 0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#e2e8f0',
                    }}
                    formatter={(value: any) => [formatCurrency(Number(value), 'ARS'), 'Capital']}
                  />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {assetBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p>Sin datos de activos registrados</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts - Near Expiration */}
        <Card className="lg:col-span-2 glass-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <CardTitle className="text-base">Alertas de Vencimiento</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {nearExpiration.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-muted-foreground text-center">
                <Clock className="w-10 h-10 mb-3 text-muted-foreground/30" />
                <p className="text-sm">Sin vencimientos próximos</p>
                <p className="text-xs mt-1">Todos los contratos están en orden</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {nearExpiration.map((contract) => (
                  <div
                    key={contract.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 animate-fade-in"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {contract.profiles?.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Vence: {formatDate(contract.end_date)} · {daysRemaining(contract)}d restantes
                      </p>
                      <p className="text-xs text-amber-400 font-medium mt-0.5">
                        {formatCurrency(Number(contract.initial_capital), contract.currency)} @ {contract.monthly_rate}%
                      </p>
                    </div>
                    <Link href={`/admin/clientes/${contract.client_id}`}>
                      <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-8 px-3">
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.totalClients}</p>
              <p className="text-xs text-muted-foreground">Inversores</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10">
              <DollarSign className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.contracts.length}</p>
              <p className="text-xs text-muted-foreground">Contratos Totales</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10">
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.assets.length}</p>
              <p className="text-xs text-muted-foreground">Activos Tasados</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5 pb-4 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-500/10">
              <CreditCard className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{data.credits.length}</p>
              <p className="text-xs text-muted-foreground">Créditos Emitidos</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
