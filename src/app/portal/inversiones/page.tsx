'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import type { Contract, AssetValuation } from '@/lib/types'
import { formatCurrency, formatDate, daysRemaining, contractProgress, calculateAccruedInterest, getContractStatusLabel, getContractStatusColor } from '@/lib/helpers'
import { FormattedAmount } from '@/components/ui/formatted-amount'
import { TrendingUp, Shield, Calendar, ArrowDownToLine, CheckCircle2, Lock, Loader2 } from 'lucide-react'
import { requestWithdrawal } from '../actions'

/** Días antes del vencimiento en los que el retiro queda bloqueado (igual que en el servidor). */
const WITHDRAWAL_LOCK_DAYS = 12

export default function PortalInversionesPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<(Contract & { assets_valuation?: AssetValuation })[]>([])
  const [loading, setLoading] = useState(true)
  const [actionDone, setActionDone] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const supabase = createClient()

  const fetchContracts = async () => {
    if (!user) return
    const { data } = await supabase.from('contracts').select('*, assets_valuation(*)').eq('client_id', user.id).order('created_at', { ascending: false })
    setContracts((data || []) as typeof contracts)
    setLoading(false)
  }

  useEffect(() => { fetchContracts() }, [user]) // eslint-disable-line

  const handleWithdraw = async (contractId: string) => {
    if (!confirm('¿Confirmás la solicitud de retiro de esta inversión? Un administrador la revisará y transferirá los fondos.')) return
    setSubmitting(contractId)

    const result = await requestWithdrawal(contractId)

    if (result.error) {
      alert(result.error)
    } else {
      setActionDone(contractId + '-withdraw')
      await fetchContracts()
    }
    setSubmitting(null)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>

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
          const remaining = daysRemaining(contract)
          const isActive = contract.status === 'activo'
          const withdrawalLocked = isActive && remaining <= WITHDRAWAL_LOCK_DAYS
          const canWithdraw = isActive && !withdrawalLocked
          const accrued = calculateAccruedInterest(contract)
          const guarantee = contract.assets_valuation
            ? `${contract.assets_valuation.asset_type === 'vehiculo' ? 'Vehículo' : contract.assets_valuation.asset_type === 'inmueble' ? 'Inmueble' : 'Efectivo'}: ${contract.assets_valuation.description}`
            : 'Efectivo'

          return (
            <Card key={contract.id} className="glass-card animate-fade-in overflow-hidden" style={{ animationDelay: `${i * 100}ms` }}>
              {withdrawalLocked && <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-400" />}
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge variant="outline" className={`text-xs ${getContractStatusColor(contract.status)}`}>
                      {getContractStatusLabel(contract.status)}
                    </Badge>
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

                {isActive && (
                  <>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1"><span>Progreso</span><span>{remaining} días</span></div>
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

                {canWithdraw && (
                  <Button
                    onClick={() => handleWithdraw(contract.id)}
                    disabled={submitting === contract.id}
                    className="w-full bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs h-11 gap-1.5"
                  >
                    {submitting === contract.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ArrowDownToLine className="w-3.5 h-3.5" />}
                    Solicitar Retiro
                  </Button>
                )}

                {withdrawalLocked && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-300">
                        Retiro bloqueado – {remaining} días al vencimiento
                      </p>
                      <p className="text-[10px] text-amber-400/70 mt-0.5 leading-relaxed">
                        No se puede solicitar el retiro cuando faltan {WITHDRAWAL_LOCK_DAYS} días o menos.
                        Al vencer, el capital se reinvierte automáticamente con interés compuesto.
                      </p>
                    </div>
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
