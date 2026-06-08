'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Contract, AssetValuation } from '@/lib/types'
import { formatCurrency, formatDate, daysRemaining, contractProgress, calculateAccruedInterest, isWithinDecisionWindow } from '@/lib/helpers'
import { FormattedAmount } from '@/components/ui/formatted-amount'
import { TrendingUp, Shield, Calendar, RefreshCw, ArrowDownToLine, CheckCircle2 } from 'lucide-react'

export default function PortalInversionesPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<(Contract & { assets_valuation?: AssetValuation })[]>([])
  const [loading, setLoading] = useState(true)
  const [actionDone, setActionDone] = useState<string | null>(null)
  const supabase = createClient()

  const fetchContracts = async () => {
    if (!user) return
    const { data } = await supabase.from('contracts').select('*, assets_valuation(*)').eq('client_id', user.id).order('created_at', { ascending: false })
    setContracts((data || []) as typeof contracts)
    setLoading(false)
  }

  useEffect(() => { fetchContracts() }, [user]) // eslint-disable-line

  const handleWithdraw = async (contractId: string) => {
    await supabase.from('contracts').update({ status: 'retirado' }).eq('id', contractId)
    setActionDone(contractId + '-withdraw')
    fetchContracts()
  }

  const handleReinvest = async (contract: Contract) => {
    const totalAccrued = Number(contract.initial_capital) + calculateAccruedInterest(contract)
    const today = new Date(); const end = new Date(today); end.setDate(end.getDate() + 30)
    await supabase.from('contracts').update({ status: 'reinvertido' }).eq('id', contract.id)
    await supabase.from('contracts').insert({
      client_id: contract.client_id, asset_id: contract.asset_id,
      initial_capital: Math.round(totalAccrued * 100) / 100, currency: contract.currency,
      monthly_rate: contract.monthly_rate, start_date: today.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0], status: 'activo',
    })
    setActionDone(contract.id + '-reinvest')
    fetchContracts()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>

  const statusLabels: Record<string, { label: string; class: string }> = {
    activo: { label: 'Activo', class: 'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30' },
    vencido: { label: 'Vencido', class: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    retirado: { label: 'Retirado', class: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
    reinvertido: { label: 'Reinvertido', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  }

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="text-center pt-2">
        <h1 className="text-xl font-bold">Mis Inversiones</h1>
        <p className="text-muted-foreground text-xs mt-1">Detalle de tus contratos</p>
      </div>

      {contracts.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-12 text-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm">Sin inversiones registradas</p>
        </CardContent></Card>
      ) : (
        contracts.map((contract, i) => {
          const status = statusLabels[contract.status] || statusLabels.activo
          const showDecision = contract.status === 'activo' && isWithinDecisionWindow(contract)
          const accrued = calculateAccruedInterest(contract)
          const guarantee = contract.assets_valuation
            ? `${contract.assets_valuation.asset_type === 'vehiculo' ? 'Vehículo' : contract.assets_valuation.asset_type === 'inmueble' ? 'Inmueble' : 'Efectivo'}: ${contract.assets_valuation.description}`
            : 'Efectivo'

          return (
            <Card key={contract.id} className="glass-card animate-fade-in overflow-hidden" style={{ animationDelay: `${i * 100}ms` }}>
              {showDecision && <div className="h-1 bg-gradient-to-r from-emerald-accent to-emerald-glow" />}
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className={`text-xs ${status.class}`}>{status.label}</Badge>
                    <div className="mt-2 block">
                      <FormattedAmount
                        amount={Number(contract.initial_capital)}
                        currency={contract.currency}
                        size="2xl"
                        color="text-foreground"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{contract.currency}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Rendimiento</p>
                    <p className="text-xl font-bold text-primary">{contract.monthly_rate}%</p>
                    <p className="text-[10px] text-muted-foreground">mensual</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-accent/30 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div><p className="text-[10px] text-muted-foreground">Garantía</p><p className="text-xs font-medium">{guarantee}</p></div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-lg bg-accent/20"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Inicio</p><p className="text-xs font-medium">{formatDate(contract.start_date)}</p></div>
                  <div className="p-2.5 rounded-lg bg-accent/20"><p className="text-[10px] text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />Liquidación</p><p className="text-xs font-medium">{formatDate(contract.end_date)}</p></div>
                </div>

                {contract.status === 'activo' && (
                  <>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1"><span>Progreso</span><span>{daysRemaining(contract)} días</span></div>
                      <Progress value={contractProgress(contract)} className="h-1.5" />
                    </div>
                    <div className="p-3 rounded-xl bg-primary/5 border border-primary/10 text-center">
                      <p className="text-[10px] text-muted-foreground">Interés acumulado</p>
                      <div className="block mt-0.5">
                        <span className="text-primary font-bold text-lg">+</span>
                        <FormattedAmount
                          amount={accrued}
                          currency={contract.currency}
                          size="lg"
                          color="text-primary"
                        />
                      </div>
                    </div>
                  </>
                )}

                {showDecision && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-center text-amber-400 font-medium">⏰ Contrato próximo a vencer</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => handleReinvest(contract)} className="bg-gradient-to-r from-emerald-accent to-emerald-glow text-deep-blue font-semibold text-xs h-11">
                        <RefreshCw className="w-3.5 h-3.5 mr-1" />Reinvertir
                      </Button>
                      <Button variant="outline" onClick={() => handleWithdraw(contract.id)} className="border-border/50 text-xs h-11">
                        <ArrowDownToLine className="w-3.5 h-3.5 mr-1" />Retirar
                      </Button>
                    </div>
                  </div>
                )}

                {actionDone === contract.id + '-reinvest' && (
                  <div className="p-3 rounded-lg bg-emerald-accent/10 border border-emerald-accent/20 flex items-center gap-2 text-emerald-glow text-xs animate-fade-in">
                    <CheckCircle2 className="w-4 h-4" />Reinversión solicitada exitosamente
                  </div>
                )}
                {actionDone === contract.id + '-withdraw' && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center gap-2 text-blue-400 text-xs animate-fade-in">
                    <CheckCircle2 className="w-4 h-4" />Retiro solicitado. Tu asesor preparará los fondos.
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
    </div>
  )
}
