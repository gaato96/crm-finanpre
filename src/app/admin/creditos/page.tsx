'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Profile, Credit, CreditInstallment, ContractTemplate, Contract, AssetValuation, CreditType } from '@/lib/types'
import { formatCurrency, formatDate, formatWhatsAppUrl } from '@/lib/helpers'
import {
  generateSchedule,
  summarizeSchedule,
  calculatePayoffAmount,
  addMonthsKeepingDay,
  defaultFirstDueDate,
  daysLateFor,
  calculateLateInterest,
  CREDIT_TYPE_LABELS,
  CREDIT_TYPE_DESCRIPTIONS,
  CREDIT_TYPE_RATE_LABELS,
  getCreditTypeColor,
} from '@/lib/credit'
import {
  CreditCard,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Calendar,
  MessageCircle,
  TrendingDown,
  RefreshCw,
  Equal,
  BadgeCheck,
  CalendarPlus,
} from 'lucide-react'

type CreditRow = Credit & {
  profiles: { full_name: string; phone?: string | null }
  credit_installments: CreditInstallment[]
  contracts?: (Contract & { assets_valuation?: AssetValuation | null }) | null
}

const CREDIT_TYPE_OPTIONS: { value: CreditType; icon: typeof Equal }[] = [
  { value: 'fija', icon: Equal },
  { value: 'decreciente', icon: TrendingDown },
  { value: 'refinanciacion', icon: RefreshCw },
]

export default function CreditosPage() {
  const [credits, setCredits] = useState<CreditRow[]>([])
  const [clients, setClients] = useState<Profile[]>([])
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const supabase = createClient()

  // Form
  const [formClient, setFormClient] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formType, setFormType] = useState<CreditType>('fija')
  const [formAmount, setFormAmount] = useState('')
  const [formRate, setFormRate] = useState('')
  const [formInstallments, setFormInstallments] = useState('')
  const [formLateRate, setFormLateRate] = useState('0.5')
  const [formFirstDueDate, setFormFirstDueDate] = useState(defaultFirstDueDate())
  const [selectedCredit, setSelectedCredit] = useState<CreditRow | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [creditAction, setCreditAction] = useState<string | null>(null)

  // Asset Financing states
  const [availableAssets, setAvailableAssets] = useState<any[]>([])
  const [selectedAvailableAssetId, setSelectedAvailableAssetId] = useState<string>('')
  const [formCurrency, setFormCurrency] = useState<'ARS' | 'USD'>('ARS')

  const fetchData = async () => {
    const [creditsRes, clientsRes, templatesRes, assetsRes] = await Promise.all([
      supabase.from('credits').select('*, profiles(full_name, phone), credit_installments(*), contracts(*, assets_valuation(*))').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'investor').order('full_name'),
      supabase.from('contract_templates').select('*').eq('type', 'credito').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('assets_available').select('*, asset_valuation:asset_valuation_id(*)').eq('status', 'disponible').order('created_at', { ascending: false })
    ])
    setCredits((creditsRes.data || []) as CreditRow[])
    setClients(clientsRes.data || [])
    const tmpls = templatesRes.data || []
    setTemplates(tmpls as ContractTemplate[])
    if (tmpls.length > 0) {
      setSelectedTemplateId(tmpls[0].id)
    }
    setAvailableAssets(assetsRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line

  useEffect(() => {
    if (selectedCredit) {
      const updated = credits.find(c => c.id === selectedCredit.id)
      setSelectedCredit(updated || null)
    }
  }, [credits]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const cid = params.get('client_id')
      if (cid) {
        setFormClient(cid)
        setDialogOpen(true)
      }
    }
  }, [clients])

  // ── Vista previa del plan de pagos ────────────────────────────────────────
  const previewSchedule = useMemo(() => {
    const total = parseFloat(formAmount)
    const rate = parseFloat(formRate)
    const numInst = parseInt(formInstallments)
    if (!total || !rate || !numInst || !formFirstDueDate) return []
    if (numInst > 120) return []
    return generateSchedule({
      creditType: formType,
      total,
      rate,
      installments: numInst,
      firstDueDate: formFirstDueDate,
    })
  }, [formType, formAmount, formRate, formInstallments, formFirstDueDate])

  const previewSummary = useMemo(
    () => summarizeSchedule(previewSchedule, formType, parseFloat(formAmount) || 0),
    [previewSchedule, formType, formAmount]
  )

  const resetForm = () => {
    setFormClient('')
    setFormType('fija')
    setFormAmount('')
    setFormRate('')
    setFormInstallments('')
    setFormLateRate('0.5')
    setFormFirstDueDate(defaultFirstDueDate())
    setSelectedAvailableAssetId('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = parseFloat(formAmount)
    const rate = parseFloat(formRate)
    const numInst = parseInt(formInstallments)
    const lateRate = parseFloat(formLateRate) || 0.0

    const schedule = generateSchedule({
      creditType: formType,
      total,
      rate,
      installments: numInst,
      firstDueDate: formFirstDueDate,
    })

    if (schedule.length === 0) {
      alert('No se pudo generar el plan de cuotas. Revisá el capital, la tasa, la cantidad de cuotas y la fecha de la primera cuota.')
      return
    }

    setSubmitting(true)

    try {
      // 1. Create the contract first
      const today = new Date()
      const lastDueDate = schedule[schedule.length - 1].due_date

      // Check if we have an asset associated
      let assetValuationId = null
      const selectedAsset = availableAssets.find(a => a.id === selectedAvailableAssetId)
      if (selectedAsset) {
        assetValuationId = selectedAsset.asset_valuation_id
      }

      const { data: contract, error: contractError } = await supabase.from('contracts').insert({
        client_id: formClient,
        asset_id: assetValuationId,
        initial_capital: total,
        current_capital: total,
        currency: formCurrency,
        monthly_rate: rate,
        start_date: today.toISOString().split('T')[0],
        end_date: lastDueDate,
        status: 'enviado', // Ready to sign
        template_id: selectedTemplateId || null,
      }).select().single()

      if (contractError) throw contractError

      const contractId = contract?.id || null

      // 2. Create the credit
      const { data: credit, error: creditError } = await supabase.from('credits').insert({
        client_id: formClient,
        total_amount: total,
        interest_rate: rate,
        total_installments: numInst,
        status: 'vigente',
        contract_id: contractId,
        daily_late_interest_rate: lateRate,
        currency: formCurrency,
        credit_type: formType,
        first_due_date: formFirstDueDate,
        payment_day: new Date(formFirstDueDate + 'T12:00:00').getDate(),
      }).select().single()

      if (creditError) throw creditError

      if (credit) {
        const { error: installmentsError } = await supabase.from('credit_installments').insert(
          schedule.map(inst => ({
            credit_id: credit.id,
            installment_number: inst.installment_number,
            amount: inst.amount,
            principal_amount: inst.principal_amount,
            interest_amount: inst.interest_amount,
            is_interest_only: inst.is_interest_only,
            due_date: inst.due_date,
            status: 'pendiente' as const,
            paid_at: null,
            late_interest: 0,
          }))
        )

        if (installmentsError) throw installmentsError

        // If we linked an available asset, we should update its status to 'vendido'
        if (selectedAvailableAssetId) {
          await supabase
            .from('assets_available')
            .update({ status: 'vendido' })
            .eq('id', selectedAvailableAssetId)

          // Also update the asset status in assets_valuation to 'financiado'
          if (assetValuationId) {
            await supabase
              .from('assets_valuation')
              .update({ status: 'financiado' })
              .eq('id', assetValuationId)
          }
        }
      }

      setDialogOpen(false)
      resetForm()
      await fetchData()
    } catch (err: any) {
      alert('Error al crear el crédito: ' + (err?.message || 'error desconocido'))
    } finally {
      setSubmitting(false)
    }
  }

  const markPaid = async (
    credit: Pick<CreditRow, 'id' | 'currency' | 'credit_type' | 'total_installments'>,
    instId: string,
    amount: number,
    lateInterest: number
  ) => {
    const currency = credit.currency || 'ARS'
    const total = amount + lateInterest
    let confirmMsg = `¿Confirmar cobro de esta cuota por ${formatCurrency(amount, currency)}?`
    if (lateInterest > 0) {
      confirmMsg = `¿Confirmar cobro de esta cuota por un total de ${formatCurrency(total, currency)}? (Incluye ${formatCurrency(lateInterest, currency)} por mora diaria acumulada)`
    }
    if (!confirm(confirmMsg)) return

    const { error } = await supabase.from('credit_installments').update({
      status: 'pagado',
      paid_at: new Date().toISOString(),
      late_interest: lateInterest,
      paid_amount: total,
    }).eq('id', instId)

    if (error) {
      alert('Error al registrar el cobro: ' + error.message)
      return
    }

    // En cuotas fijas/decrecientes, si ya no queda nada pendiente el crédito se finaliza solo
    if (credit.credit_type !== 'refinanciacion') {
      const { count } = await supabase
        .from('credit_installments')
        .select('id', { count: 'exact', head: true })
        .eq('credit_id', credit.id)
        .neq('status', 'pagado')

      if ((count ?? 0) === 0) {
        await supabase.from('credits').update({ status: 'finalizado' }).eq('id', credit.id)
      }
    }

    fetchData()
  }

  /** Refinanciación: el cliente junta el dinero y cancela capital + interés del mes. */
  const handlePayoff = async (credit: CreditRow) => {
    const payoff = calculatePayoffAmount(Number(credit.total_amount), Number(credit.interest_rate))
    const currency = credit.currency || 'ARS'
    if (!confirm(
      `¿Confirmar la CANCELACIÓN TOTAL de la deuda de ${credit.profiles?.full_name}?\n\n` +
      `Capital: ${formatCurrency(Number(credit.total_amount), currency)}\n` +
      `Interés del período: ${formatCurrency(payoff - Number(credit.total_amount), currency)}\n` +
      `Total a cobrar: ${formatCurrency(payoff, currency)}\n\n` +
      `Se dará el crédito por finalizado y se eliminarán las cuotas de interés proyectadas que queden pendientes.`
    )) return

    setCreditAction(credit.id)
    try {
      const pending = (credit.credit_installments || []).filter(i => i.status !== 'pagado')
      const nextNumber = Math.max(0, ...(credit.credit_installments || []).map(i => i.installment_number)) + 1

      // La cuota de cancelación queda registrada como cobrada
      const { error: payoffError } = await supabase.from('credit_installments').insert({
        credit_id: credit.id,
        installment_number: nextNumber,
        amount: payoff,
        principal_amount: Number(credit.total_amount),
        interest_amount: payoff - Number(credit.total_amount),
        is_interest_only: false,
        is_payoff: true,
        due_date: new Date().toISOString().split('T')[0],
        status: 'pagado' as const,
        paid_at: new Date().toISOString(),
        paid_amount: payoff,
        late_interest: 0,
      })

      if (payoffError) throw payoffError

      // Se limpian las proyecciones de interés que ya no se van a cobrar
      if (pending.length > 0) {
        await supabase
          .from('credit_installments')
          .delete()
          .in('id', pending.map(i => i.id))
      }

      const { error: creditError } = await supabase.from('credits').update({
        status: 'finalizado',
        payoff_amount: payoff,
        payoff_at: new Date().toISOString(),
      }).eq('id', credit.id)

      if (creditError) throw creditError

      await fetchData()
    } catch (err: any) {
      alert('Error al cancelar la deuda: ' + (err?.message || 'error desconocido'))
    } finally {
      setCreditAction(null)
    }
  }

  /** Refinanciación: agrega 12 meses más de cuotas de interés si el cliente sigue refinanciando. */
  const handleExtendProjection = async (credit: CreditRow) => {
    setCreditAction(credit.id)
    try {
      const existing = credit.credit_installments || []
      const lastNumber = Math.max(0, ...existing.map(i => i.installment_number))
      const lastDue = existing.reduce(
        (max, i) => (i.due_date > max ? i.due_date : max),
        credit.first_due_date || new Date().toISOString().split('T')[0]
      )
      const monthlyInterest = Math.round(Number(credit.total_amount) * (Number(credit.interest_rate) / 100) * 100) / 100

      const extra = Array.from({ length: 12 }, (_, i) => ({
        credit_id: credit.id,
        installment_number: lastNumber + i + 1,
        amount: monthlyInterest,
        principal_amount: 0,
        interest_amount: monthlyInterest,
        is_interest_only: true,
        due_date: addMonthsKeepingDay(lastDue, i + 1),
        status: 'pendiente' as const,
        paid_at: null,
        late_interest: 0,
      }))

      const { error } = await supabase.from('credit_installments').insert(extra)
      if (error) throw error

      await supabase
        .from('credits')
        .update({ total_installments: lastNumber + 12 })
        .eq('id', credit.id)

      await fetchData()
    } catch (err: any) {
      alert('Error al extender la proyección: ' + (err?.message || 'error desconocido'))
    } finally {
      setCreditAction(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>

  // Build calendar data for current month
  const now = new Date()
  const allInstallments = credits.flatMap(c =>
    (c.credit_installments || []).map(inst => {
      const daysLate = daysLateFor(inst.due_date)
      const isOverdue = inst.status === 'pendiente' && daysLate > 0
      const calculatedLateInterest = inst.status !== 'pagado' && daysLate > 0
        ? calculateLateInterest(Number(inst.amount), c.daily_late_interest_rate || 0, daysLate)
        : (inst.late_interest || 0)

      return {
        ...inst,
        clientName: c.profiles?.full_name || 'N/A',
        credit: c,
        daysLate,
        calculatedLateInterest,
        isOverdue,
        currency: c.currency || 'ARS',
      }
    })
  )
  const thisMonthInst = allInstallments.filter(inst => {
    const d = new Date(inst.due_date + 'T12:00:00')
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).sort((a, b) => a.due_date.localeCompare(b.due_date))

  const selectedCreditType: CreditType = selectedCredit?.credit_type || 'fija'
  const selectedPaidCount = selectedCredit?.credit_installments?.filter(i => i.status === 'pagado').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl lg:text-3xl font-bold">Cartera de Créditos</h1>
          <p className="text-muted-foreground mt-1 text-sm">Control de préstamos y calendario de cuotas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="w-full sm:w-auto bg-gradient-to-r from-emerald-accent to-emerald-glow text-deep-blue font-semibold shadow-lg shadow-emerald-accent/20" />
            }
          >
            <Plus className="w-4 h-4 mr-2" />Nuevo Crédito
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Otorgar Crédito</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              {/* Modalidad de crédito */}
              <div className="space-y-2">
                <Label>Modalidad de Devolución</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CREDIT_TYPE_OPTIONS.map(({ value, icon: Icon }) => {
                    const active = formType === value
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFormType(value)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          active
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'border-border/60 bg-input/30 text-muted-foreground hover:bg-accent/40'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          {CREDIT_TYPE_LABELS[value]}
                        </span>
                        <span className="block text-[10px] leading-snug mt-1 opacity-80">
                          {CREDIT_TYPE_DESCRIPTIONS[value]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente Deudor</Label>
                  <select value={formClient} onChange={e => setFormClient(e.target.value)} required className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm">
                    <option value="">Seleccionar...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.cuit || c.full_name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Plantilla de Contrato</Label>
                  <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} required className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm">
                    {templates.length === 0 ? (
                      <option value="">No hay plantillas activas</option>
                    ) : (
                      templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)
                    )}
                  </select>
                </div>
              </div>

              {/* Financiar Activo */}
              <div className="space-y-2">
                <Label>Financiar Activo Disponible (Opcional)</Label>
                <select
                  value={selectedAvailableAssetId}
                  onChange={e => {
                    const id = e.target.value
                    setSelectedAvailableAssetId(id)
                    if (id) {
                      const asset = availableAssets.find(a => a.id === id)
                      if (asset) {
                        setFormAmount(asset.listed_value.toString())
                        if (asset.currency === 'ARS' || asset.currency === 'USD') {
                          setFormCurrency(asset.currency)
                        }
                      }
                    } else {
                      setFormAmount('')
                    }
                  }}
                  className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                >
                  <option value="">Ninguno (Préstamo de dinero estándar)</option>
                  {availableAssets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title} ({formatCurrency(asset.listed_value, asset.currency)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Moneda</Label>
                  <select
                    value={formCurrency}
                    onChange={e => setFormCurrency(e.target.value as 'ARS' | 'USD')}
                    disabled={!!selectedAvailableAssetId}
                    className={`w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground ${
                      selectedAvailableAssetId ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                  >
                    <option value="ARS">ARS ($)</option>
                    <option value="USD">USD (US$)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Capital Prestado</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    required
                    readOnly={!!selectedAvailableAssetId}
                    className={`bg-input/50 ${
                      selectedAvailableAssetId ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>{CREDIT_TYPE_RATE_LABELS[formType]}</Label>
                  <Input type="number" step="0.01" min="0.1" value={formRate} onChange={e => setFormRate(e.target.value)} required className="bg-input/50" />
                </div>
                <div className="space-y-2">
                  <Label>{formType === 'refinanciacion' ? 'Meses proyectados' : 'Nº Cuotas'}</Label>
                  <Input type="number" min="1" max="120" value={formInstallments} onChange={e => setFormInstallments(e.target.value)} required className="bg-input/50" />
                </div>
                <div className="space-y-2">
                  <Label>Mora Diaria (%)</Label>
                  <Input type="number" step="0.01" min="0" value={formLateRate} onChange={e => setFormLateRate(e.target.value)} required className="bg-input/50" />
                </div>
              </div>

              {/* Fecha de pago elegible */}
              <div className="space-y-2">
                <Label>Fecha de Pago de la Primera Cuota</Label>
                <Input
                  type="date"
                  value={formFirstDueDate}
                  onChange={e => setFormFirstDueDate(e.target.value)}
                  required
                  className="bg-input/50"
                />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Las cuotas siguientes vencen el día{' '}
                  <span className="text-primary font-semibold">
                    {formFirstDueDate ? new Date(formFirstDueDate + 'T12:00:00').getDate() : '—'}
                  </span>{' '}
                  de cada mes. Elegí el día que le conviene al cliente (por ejemplo, cuando cobra el sueldo).
                </p>
              </div>

              {formType === 'refinanciacion' && (
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300 leading-relaxed">
                  El cliente paga <strong>solo el interés</strong> cada mes para mantener el préstamo vigente.
                  Los meses proyectados son una estimación: podés extender la proyección cuando haga falta, y
                  cancelar la deuda completa (capital + interés) desde el detalle del crédito cuando el cliente junte el dinero.
                </div>
              )}

              {/* Vista previa del plan de pagos */}
              {previewSchedule.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {formType === 'refinanciacion' ? 'Cuota mensual' : 'Primera cuota'}
                      </p>
                      <p className="text-sm font-bold text-primary tabular-nums mt-0.5">{formatCurrency(previewSummary.firstInstallment, formCurrency)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-accent/20 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {formType === 'refinanciacion' ? 'Cancelación total' : 'Última cuota'}
                      </p>
                      <p className="text-sm font-bold tabular-nums mt-0.5">
                        {formatCurrency(
                          formType === 'refinanciacion'
                            ? calculatePayoffAmount(parseFloat(formAmount) || 0, parseFloat(formRate) || 0)
                            : previewSummary.lastInstallment,
                          formCurrency
                        )}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-accent/20 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Interés total</p>
                      <p className="text-sm font-bold tabular-nums mt-0.5">{formatCurrency(previewSummary.totalInterest, formCurrency)}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-accent/20 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {formType === 'decreciente' ? 'Baja por mes' : 'Total a cobrar'}
                      </p>
                      <p className="text-sm font-bold tabular-nums mt-0.5">
                        {formatCurrency(
                          formType === 'decreciente' ? previewSummary.monthlyDecrease : previewSummary.totalToPay,
                          formCurrency
                        )}
                      </p>
                    </div>
                  </div>

                  <details className="rounded-lg border border-border/40 bg-accent/10 overflow-hidden" open={formType === 'decreciente'}>
                    <summary className="px-3 py-2 text-xs font-semibold cursor-pointer select-none hover:bg-accent/30 transition-colors">
                      Ver plan de pagos completo ({previewSchedule.length} cuotas)
                    </summary>
                    <div className="max-h-56 overflow-y-auto divide-y divide-border/20">
                      {previewSchedule.map(inst => (
                        <div key={inst.installment_number} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                          <span className="text-muted-foreground shrink-0 w-8">#{inst.installment_number}</span>
                          <span className="text-muted-foreground flex-1 truncate">{formatDate(inst.due_date)}</span>
                          <span className="font-semibold tabular-nums shrink-0">{formatCurrency(inst.amount, formCurrency)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              <Button type="submit" className="w-full bg-gradient-to-r from-emerald-accent to-emerald-glow text-deep-blue font-semibold" disabled={submitting}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Procesando...</> : 'Crear Crédito'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Calendar View */}
      <Card className="glass-card">
        <CardHeader><div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /><CardTitle className="text-base">Calendario de Cuotas — {now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}</CardTitle></div></CardHeader>
        <CardContent>
          {thisMonthInst.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground"><Calendar className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" /><p className="text-sm">Sin cuotas este mes</p></div>
          ) : (
            <div className="space-y-2">
              {thisMonthInst.map(inst => (
                <div key={inst.id} className={`flex items-center gap-3 sm:gap-4 p-3 rounded-xl transition-colors ${inst.isOverdue ? 'moroso-row bg-red-500/5' : inst.status === 'pagado' ? 'bg-emerald-accent/5' : 'bg-accent/30'}`}>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-accent/50 flex flex-col items-center justify-center text-xs shrink-0">
                    <span className="font-bold text-sm">{new Date(inst.due_date + 'T12:00:00').getDate()}</span>
                    <span className="text-muted-foreground text-[10px]">{new Date(inst.due_date + 'T12:00:00').toLocaleDateString('es-AR', { month: 'short' })}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inst.clientName}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        Cuota #{inst.installment_number} · {formatCurrency(Number(inst.amount), inst.currency)}
                      </span>
                      {inst.is_interest_only && (
                        <span className="text-[10px] text-amber-400 font-semibold">solo interés</span>
                      )}
                      {inst.isOverdue && (
                        <span className="text-[10px] text-red-400 font-bold">+{inst.daysLate}d demorado ({formatCurrency(inst.calculatedLateInterest, inst.currency)} mora)</span>
                      )}
                      {inst.status === 'pagado' && inst.late_interest > 0 && (
                        <span className="text-[10px] text-emerald-400 font-medium">mora cobrada: {formatCurrency(inst.late_interest, inst.currency)}</span>
                      )}
                    </div>
                  </div>
                  {inst.isOverdue ? (
                    <Button
                      size="sm"
                      className="bg-red-500 hover:bg-red-600 text-white font-semibold text-xs h-7 px-2.5 sm:px-3 shrink-0"
                      onClick={() => markPaid(inst.credit, inst.id, Number(inst.amount), inst.calculatedLateInterest)}
                    >
                      <span className="hidden sm:inline">Cobrar {formatCurrency(Number(inst.amount) + inst.calculatedLateInterest, inst.currency)}</span>
                      <span className="sm:hidden">Cobrar</span>
                    </Button>
                  ) : inst.status === 'pagado' ? (
                    <Badge variant="outline" className="bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30 text-xs shrink-0">
                      <CheckCircle2 className="w-3 h-3 sm:mr-1" />
                      <span className="hidden sm:inline">Pagado</span>
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markPaid(inst.credit, inst.id, Number(inst.amount), 0)}
                      className="border-primary/30 text-primary hover:bg-primary/10 text-xs h-7 shrink-0"
                    >
                      Cobrar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credits List */}
      <Card className="glass-card overflow-hidden">
        <CardHeader><div className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /><CardTitle className="text-base">Todos los Créditos</CardTitle></div></CardHeader>

        {/* Mobile: tarjetas */}
        <div className="sm:hidden divide-y divide-border/30">
          {credits.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin créditos otorgados</p>
          )}
          {credits.map(credit => (
            <button
              key={credit.id}
              onClick={() => setSelectedCredit(credit)}
              className="w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{credit.profiles?.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatCurrency(Number(credit.total_amount), credit.currency)} · {credit.interest_rate}%
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${credit.status === 'moroso' ? 'bg-red-500/15 text-red-400 border-red-500/30' : credit.status === 'vigente' ? 'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                  {credit.status.charAt(0).toUpperCase() + credit.status.slice(1)}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${getCreditTypeColor(credit.credit_type || 'fija')}`}>
                  {CREDIT_TYPE_LABELS[credit.credit_type || 'fija']}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {(credit.credit_installments || []).filter(i => i.status === 'pagado').length}/{credit.total_installments} cuotas
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Desktop: tabla */}
        <div className="hidden sm:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50">
                <TableHead>Cliente</TableHead>
                <TableHead>Modalidad</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead className="hidden md:table-cell">Tasa</TableHead>
                <TableHead className="hidden md:table-cell">Cuotas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.map(credit => (
                <TableRow
                  key={credit.id}
                  onClick={() => setSelectedCredit(credit)}
                  className="border-border/30 hover:bg-accent/50 cursor-pointer animate-fade-in"
                >
                  <TableCell className="font-medium text-sm">
                    <div className="space-y-1">
                      <p>{credit.profiles?.full_name}</p>
                      {credit.contracts?.assets_valuation && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                          🏠 {credit.contracts.assets_valuation.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${getCreditTypeColor(credit.credit_type || 'fija')}`}>
                      {CREDIT_TYPE_LABELS[credit.credit_type || 'fija']}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm font-semibold tabular-nums">{formatCurrency(Number(credit.total_amount), credit.currency)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{credit.interest_rate}% (+{credit.daily_late_interest_rate || 0}% mora/día)</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{(credit.credit_installments || []).filter(i => i.status === 'pagado').length}/{credit.total_installments}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${credit.status === 'moroso' ? 'bg-red-500/15 text-red-400 border-red-500/30' : credit.status === 'vigente' ? 'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                      {credit.status === 'moroso' && <AlertTriangle className="w-3 h-3 mr-1" />}{credit.status.charAt(0).toUpperCase() + credit.status.slice(1)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Dialog: Credit Details & Installments list */}
      <Dialog open={!!selectedCredit} onOpenChange={open => !open && setSelectedCredit(null)}>
        <DialogContent className="glass-card border-border/50 w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-base">
              <CreditCard className="w-5 h-5 text-primary shrink-0" />
              <span className="truncate">Crédito — {selectedCredit?.profiles?.full_name}</span>
              {selectedCredit?.profiles?.phone && formatWhatsAppUrl(selectedCredit.profiles.phone) && (
                <a
                  href={formatWhatsAppUrl(selectedCredit.profiles.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="WhatsApp"
                  className="sm:ml-auto inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors font-medium shrink-0"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp
                </a>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedCredit && (
            <div className="space-y-6 mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-xs ${getCreditTypeColor(selectedCreditType)}`}>
                  {CREDIT_TYPE_LABELS[selectedCreditType]}
                </Badge>
                {selectedCredit.payment_day && (
                  <span className="text-[11px] text-muted-foreground">
                    Vence el día {selectedCredit.payment_day} de cada mes
                  </span>
                )}
              </div>

              {/* Linked Asset Info if available */}
              {selectedCredit.contracts?.assets_valuation && (
                <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                  <p className="font-semibold text-blue-200">Activo Financiado</p>
                  <p className="mt-1 text-slate-300 font-medium">
                    {selectedCredit.contracts.assets_valuation.asset_type.charAt(0).toUpperCase() + selectedCredit.contracts.assets_valuation.asset_type.slice(1)}: {selectedCredit.contracts.assets_valuation.description}
                  </p>
                </div>
              )}

              {/* Credit summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-[11px] text-muted-foreground font-semibold">Capital Prestado</p>
                  <p className="text-base font-bold mt-0.5 tabular-nums">{formatCurrency(Number(selectedCredit.total_amount), selectedCredit.currency)}</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-[11px] text-muted-foreground font-semibold">
                    {selectedCreditType === 'fija' ? 'Tasa Total' : 'Tasa Mensual'}
                  </p>
                  <p className="text-base font-bold mt-0.5">{selectedCredit.interest_rate}%</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-[11px] text-muted-foreground font-semibold">Mora Diaria</p>
                  <p className="text-base font-bold mt-0.5">{selectedCredit.daily_late_interest_rate || 0}%</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-[11px] text-muted-foreground font-semibold">
                    {selectedCreditType === 'refinanciacion' ? 'Meses Pagados' : 'Cuotas Pagas'}
                  </p>
                  <p className="text-base font-bold mt-0.5">
                    {selectedPaidCount} / {selectedCredit.total_installments}
                  </p>
                </div>
              </div>

              {/* Acciones de refinanciación constante */}
              {selectedCreditType === 'refinanciacion' && selectedCredit.status !== 'finalizado' && (
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-300">Refinanciación Constante</p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      El cliente paga {formatCurrency(Number(selectedCredit.total_amount) * (Number(selectedCredit.interest_rate) / 100), selectedCredit.currency)} de interés por mes.
                      Para cancelar debe abonar {' '}
                      <strong className="text-amber-300">
                        {formatCurrency(calculatePayoffAmount(Number(selectedCredit.total_amount), Number(selectedCredit.interest_rate)), selectedCredit.currency)}
                      </strong>{' '}
                      (capital + interés del período).
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      size="sm"
                      onClick={() => handlePayoff(selectedCredit)}
                      disabled={creditAction === selectedCredit.id}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs h-9"
                    >
                      {creditAction === selectedCredit.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <><BadgeCheck className="w-3.5 h-3.5 mr-1.5" />Cancelar Deuda Total</>}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExtendProjection(selectedCredit)}
                      disabled={creditAction === selectedCredit.id}
                      className="flex-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs h-9"
                    >
                      <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
                      Extender 12 meses
                    </Button>
                  </div>
                </div>
              )}

              {selectedCredit.payoff_at && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300">
                  Deuda cancelada el {formatDate(selectedCredit.payoff_at)} por{' '}
                  <strong>{formatCurrency(Number(selectedCredit.payoff_amount || 0), selectedCredit.currency)}</strong>.
                </div>
              )}

              {/* Installments list */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Listado Completo de Cuotas</h3>
                <div className="border border-border/40 rounded-xl overflow-hidden divide-y divide-border/20">
                  {(selectedCredit.credit_installments || [])
                    .slice()
                    .sort((a, b) => a.installment_number - b.installment_number)
                    .map(inst => {
                      const daysLate = daysLateFor(inst.due_date)
                      const isOverdue = inst.status === 'pendiente' && daysLate > 0
                      const lateInterest = inst.status !== 'pagado' && daysLate > 0
                        ? calculateLateInterest(Number(inst.amount), selectedCredit.daily_late_interest_rate || 0, daysLate)
                        : (inst.late_interest || 0)
                      const total = Number(inst.amount) + lateInterest

                      return (
                        <div key={inst.id} className="flex items-center gap-3 p-3">
                          <span className="text-[11px] font-semibold text-muted-foreground w-8 shrink-0">
                            #{inst.installment_number}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-sm font-semibold tabular-nums">
                                {formatCurrency(Number(inst.amount), selectedCredit.currency)}
                              </span>
                              {lateInterest > 0 && (
                                <span className="text-[11px] text-red-400 font-medium tabular-nums">
                                  + {formatCurrency(lateInterest, selectedCredit.currency)} mora
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-[11px] text-muted-foreground">{formatDate(inst.due_date)}</span>
                              {inst.is_payoff ? (
                                <span className="text-[10px] font-semibold text-emerald-400">cancelación total</span>
                              ) : inst.is_interest_only ? (
                                <span className="text-[10px] font-semibold text-amber-400">solo interés</span>
                              ) : null}
                              {inst.status === 'pagado' ? (
                                <span className="text-[10px] font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                  Pagado{inst.paid_at ? ` · ${formatDate(inst.paid_at)}` : ''}
                                </span>
                              ) : isOverdue ? (
                                <span className="text-[10px] font-semibold text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                                  Mora ({daysLate}d)
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-500/20">
                                  Pendiente
                                </span>
                              )}
                            </div>
                          </div>
                          {inst.status !== 'pagado' && (
                            <Button
                              size="sm"
                              onClick={() => markPaid(selectedCredit, inst.id, Number(inst.amount), lateInterest)}
                              className={`h-7 px-2.5 text-xs font-semibold shrink-0 ${isOverdue ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30'}`}
                            >
                              Cobrar
                              <span className="hidden sm:inline">&nbsp;{formatCurrency(total, selectedCredit.currency)}</span>
                            </Button>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
