'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { Contract, ContractEvent } from '@/lib/types'
import {
  formatCurrency,
  formatCurrencyPrecise,
  calculateEarningsPerSecond,
  calculateAccruedInterest,
  calculateCompoundCapital,
  daysRemaining,
  contractProgress,
  formatDate,
  getContractStatusLabel,
  getContractStatusColor,
} from '@/lib/helpers'
import {
  TrendingUp,
  Wallet,
  Clock,
  ArrowUpRight,
  HelpCircle,
  ArrowDownLeft,
  Loader2,
  FileText,
  Download,
  AlertTriangle,
} from 'lucide-react'

export default function PortalHomePage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)

  // Ticker states for real-time calculation
  const [tickerARS, setTickerARS] = useState({ total: 0, initial: 0, gains: 0, eps: 0 })
  const [tickerUSD, setTickerUSD] = useState({ total: 0, initial: 0, gains: 0, eps: 0 })

  const supabase = createClient()

  const fetchContracts = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('contracts')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })

    setContracts(data || [])
    setLoading(false)
  }, [user, supabase])

  useEffect(() => {
    fetchContracts()
  }, [fetchContracts])

  // Smooth real-time update ticker (runs every 100ms)
  const updateRealtimeBalances = useCallback(() => {
    let arsTotal = 0, arsInitial = 0, arsGains = 0, arsEps = 0
    let usdTotal = 0, usdInitial = 0, usdGains = 0, usdEps = 0

    contracts.forEach((c) => {
      if (c.status === 'activo' || c.status === 'retiro_solicitado') {
        const current = calculateCompoundCapital(c)
        const accrued = current - Number(c.initial_capital)
        const eps = calculateEarningsPerSecond(c)

        if (c.currency === 'ARS') {
          arsTotal += current
          arsInitial += Number(c.initial_capital)
          arsGains += accrued
          arsEps += eps
        } else {
          usdTotal += current
          usdInitial += Number(c.initial_capital)
          usdGains += accrued
          usdEps += eps
        }
      }
    })

    setTickerARS({ total: arsTotal, initial: arsInitial, gains: arsGains, eps: arsEps })
    setTickerUSD({ total: usdTotal, initial: usdInitial, gains: usdGains, eps: usdEps })
  }, [contracts])

  useEffect(() => {
    if (contracts.length === 0) return
    updateRealtimeBalances()
    const interval = setInterval(updateRealtimeBalances, 100)
    return () => clearInterval(interval)
  }, [contracts, updateRealtimeBalances])

  // Request withdrawal handler
  const handleRequestWithdrawal = async (contractId: string) => {
    if (!confirm('¿Estás seguro de solicitar el retiro de esta inversión? Se suspenderá la generación de nuevos intereses una vez confirmado por el administrador.')) return
    setSubmitting(contractId)

    try {
      const today = new Date().toISOString()
      const { error } = await supabase
        .from('contracts')
        .update({
          status: 'retiro_solicitado',
          withdrawal_requested_at: today,
        })
        .eq('id', contractId)

      if (error) throw error

      // Log event
      await supabase.from('contract_events').insert({
        contract_id: contractId,
        event_type: 'withdrawal_requested',
        ip_address: null,
        user_agent: typeof window !== 'undefined' ? navigator.userAgent : null,
      })

      fetchContracts()
    } catch (err: any) {
      alert('Error al procesar solicitud: ' + err.message)
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  // Active contracts list
  const activeContracts = contracts.filter(
    (c) => c.status === 'activo' || c.status === 'retiro_solicitado' || c.status === 'pendiente_fondos' || c.status === 'enviado'
  )

  // Completed contracts / withdrawals list
  const historicalContracts = contracts.filter(
    (c) => c.status === 'retirado' || c.status === 'reinvertido' || c.status === 'vencido'
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Greeting */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Resumen de Cuenta</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
          Monitoreá el rendimiento de tus inversiones en tiempo real
        </p>
      </div>

      {/* Main Ticker Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ARS Portfolio */}
        {(tickerARS.total > 0 || contracts.some(c => c.currency === 'ARS')) && (
          <Card className="glass-card overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-6 relative space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Portafolio en Pesos (ARS)
                </span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] uppercase font-bold">
                  ARS Ticker
                </Badge>
              </div>

              <div>
                <p className="text-3xl font-extrabold ticker-glow text-primary tabular-nums tracking-tight">
                  {formatCurrencyPrecise(tickerARS.total, 'ARS')}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">
                    +{formatCurrency(tickerARS.gains, 'ARS')}
                  </span>
                  <span className="text-muted-foreground">ganancia acumulada</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[11px] text-muted-foreground">
                  Creciendo a <span className="font-mono text-emerald-400">+{formatCurrencyPrecise(tickerARS.eps, 'ARS')}/seg</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* USD Portfolio */}
        {(tickerUSD.total > 0 || contracts.some(c => c.currency === 'USD')) && (
          <Card className="glass-card overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-6 relative space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Portafolio en Dólares (USD)
                </span>
                <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px] uppercase font-bold">
                  USD Ticker
                </Badge>
              </div>

              <div>
                <p className="text-3xl font-extrabold ticker-glow text-blue-400 tabular-nums tracking-tight">
                  {formatCurrencyPrecise(tickerUSD.total, 'USD')}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">
                    +{formatCurrency(tickerUSD.gains, 'USD')}
                  </span>
                  <span className="text-muted-foreground">ganancia acumulada</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-xs">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-[11px] text-muted-foreground">
                  Creciendo a <span className="font-mono text-blue-400">+{formatCurrencyPrecise(tickerUSD.eps, 'USD')}/seg</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs Layout */}
      <Tabs defaultValue="activas" className="w-full">
        <TabsList className="bg-accent/40 w-full grid grid-cols-2 p-1 max-w-sm">
          <TabsTrigger value="activas" className="text-xs sm:text-sm">Inversiones Activas ({activeContracts.length})</TabsTrigger>
          <TabsTrigger value="historial" className="text-xs sm:text-sm">Retiros y Cierres ({historicalContracts.length})</TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Investments */}
        <TabsContent value="activas" className="space-y-4 mt-4">
          {activeContracts.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm font-semibold">No tenés inversiones activas</p>
                <p className="text-xs mt-1">Contactá con tu asesor comercial para activar una inversión.</p>
              </CardContent>
            </Card>
          ) : (
            activeContracts.map((contract) => {
              const currentCap = calculateCompoundCapital(contract)
              const accrued = currentCap - contract.initial_capital
              const isRetiro = contract.status === 'retiro_solicitado'
              const isPendFondos = contract.status === 'pendiente_fondos'
              const isEnviado = contract.status === 'enviado'

              return (
                <Card key={contract.id} className="glass-card overflow-hidden">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      {/* Name & status */}
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={`text-xs ${getContractStatusColor(contract.status)}`}>
                            {getContractStatusLabel(contract.status)}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            ID: {contract.id.slice(0, 8)}...
                          </span>
                        </div>
                        <h3 className="text-lg font-bold mt-2">
                          Inversión en {contract.currency === 'ARS' ? 'Pesos' : 'Dólares'}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Inicio: {formatDate(contract.start_date)} · Vence: {formatDate(contract.end_date)}
                        </p>
                      </div>

                      {/* Capital values */}
                      <div className="text-left sm:text-right">
                        <span className="text-xs text-muted-foreground block">
                          {isRetiro ? 'Capital a Retirar:' : 'Capital en Crecimiento:'}
                        </span>
                        <span className={`text-xl font-black ${isRetiro ? 'text-orange-400' : 'text-emerald-400'}`}>
                          {formatCurrency(currentCap, contract.currency)}
                        </span>
                        {accrued > 0 && (
                          <span className="text-xs text-emerald-400/80 block mt-0.5">
                            +{formatCurrency(accrued, contract.currency)} interés ganado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress slider (only if active) */}
                    {(contract.status === 'activo' || isRetiro) && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Progreso del período (12 meses)</span>
                          <span>{daysRemaining(contract)} días restantes</span>
                        </div>
                        <Progress value={contractProgress(contract)} className="h-2" />
                      </div>
                    )}

                    {/* Withdrawal alert banner */}
                    {isRetiro && (
                      <div className="p-3 text-xs rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 flex items-start gap-2">
                        <AlertTriangle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-orange-400" />
                        <div className="space-y-0.5">
                          <p className="font-semibold">Solicitud de Retiro en Proceso</p>
                          <p className="text-slate-400">
                            Pediste retirar tu capital el {contract.withdrawal_requested_at ? formatDate(contract.withdrawal_requested_at) : 'fecha reciente'}. Un administrador confirmará la transferencia de fondos a la brevedad.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Pending funds description */}
                    {isPendFondos && (
                      <div className="p-3 text-xs rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2">
                        <Clock className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-400" />
                        <div className="space-y-0.5">
                          <p className="font-semibold">Esperando Acreditación de Fondos</p>
                          <p className="text-slate-400">
                            Firmaste el contrato digitalmente. Por favor, realizá la transferencia por el monto de {formatCurrency(contract.initial_capital, contract.currency)} y notificá a tu asesor para que el contrato pase a estar Activo.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Pending signature */}
                    {isEnviado && (
                      <div className="p-3 text-xs rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center justify-between gap-3">
                        <div className="flex gap-2 items-start">
                          <FileText className="w-4.5 h-4.5 shrink-0 mt-0.5 text-blue-400" />
                          <div className="space-y-0.5">
                            <p className="font-semibold">Contrato Pendiente de Firma</p>
                            <p className="text-slate-400">Tenés un contrato pendiente de firmar electrónicamente.</p>
                          </div>
                        </div>
                        {contract.sign_token && (
                          <a
                            href={`/firmar/${contract.sign_token}`}
                            className={cn(buttonVariants({ size: 'sm' }), "bg-blue-500 hover:bg-blue-600 text-slate-950 font-bold flex items-center justify-center")}
                          >
                            Firmar Contrato
                          </a>
                        )}
                      </div>
                    )}

                    {/* Buttons & stats */}
                    <div className="flex items-center justify-between gap-4 pt-3 border-t border-border/20 flex-wrap">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div>
                          <span>Capital Inicial: </span>
                          <strong className="text-foreground">{formatCurrency(Number(contract.initial_capital), contract.currency)}</strong>
                        </div>
                        <div>
                          <span>Tasa Mensual: </span>
                          <strong className="text-primary">{contract.monthly_rate}%</strong>
                        </div>
                      </div>

                      {contract.status === 'activo' && (
                        <Button
                          size="sm"
                          onClick={() => handleRequestWithdrawal(contract.id)}
                          disabled={submitting === contract.id}
                          className="bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold gap-2 text-xs h-9 px-4 rounded-lg"
                        >
                          {submitting === contract.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-slate-950" />
                          )}
                          Solicitar Retiro
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

        {/* Tab 2: Historical / Completed */}
        <TabsContent value="historial" className="space-y-4 mt-4">
          {historicalContracts.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
                <p className="text-sm font-semibold">No hay cierres registrados aún</p>
                <p className="text-xs mt-1">Los contratos retirados o reinvertidos aparecerán en esta sección.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {historicalContracts.map((contract) => (
                <Card key={contract.id} className="glass-card card-hover">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${getContractStatusColor(contract.status)}`}>
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm">
                              Inversión en {contract.currency} · {formatCurrency(Number(contract.initial_capital), contract.currency)}
                            </h4>
                            <Badge variant="outline" className={`text-[10px] ${getContractStatusColor(contract.status)}`}>
                              {getContractStatusLabel(contract.status)}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Ciclo: {formatDate(contract.start_date)} al {formatDate(contract.end_date)}
                            {contract.withdrawal_confirmed_at && ` · Retirado el: ${formatDate(contract.withdrawal_confirmed_at)}`}
                          </p>
                        </div>
                      </div>

                      {contract.contract_pdf_url && (
                        <a
                          href={contract.contract_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "h-8 gap-1.5 border-border/50 text-xs text-muted-foreground hover:text-foreground shrink-0 self-end sm:self-center flex items-center justify-center")}
                        >
                          <Download className="w-3.5 h-3.5" />
                          Contrato PDF
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
