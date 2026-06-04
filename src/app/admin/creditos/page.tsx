'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Profile, Credit, CreditInstallment, ContractTemplate } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/helpers'
import { CreditCard, Plus, AlertTriangle, CheckCircle2, Clock, Loader2, Calendar } from 'lucide-react'

export default function CreditosPage() {
  const [credits, setCredits] = useState<(Credit & { profiles: { full_name: string }; credit_installments: CreditInstallment[] })[]>([])
  const [clients, setClients] = useState<Profile[]>([])
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const supabase = createClient()

  // Form
  const [formClient, setFormClient] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formRate, setFormRate] = useState('')
  const [formInstallments, setFormInstallments] = useState('')
  const [formLateRate, setFormLateRate] = useState('0.5')
  const [selectedCredit, setSelectedCredit] = useState<typeof credits[0] | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fetchData = async () => {
    const [creditsRes, clientsRes, templatesRes] = await Promise.all([
      supabase.from('credits').select('*, profiles(full_name), credit_installments(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'investor').order('full_name'),
      supabase.from('contract_templates').select('*').eq('type', 'credito').eq('is_active', true).order('created_at', { ascending: false })
    ])
    setCredits((creditsRes.data || []) as typeof credits)
    setClients(clientsRes.data || [])
    const tmpls = templatesRes.data || []
    setTemplates(tmpls as ContractTemplate[])
    if (tmpls.length > 0) {
      setSelectedTemplateId(tmpls[0].id)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, []) // eslint-disable-line

  useEffect(() => {
    if (selectedCredit) {
      const updated = credits.find(c => c.id === selectedCredit.id)
      setSelectedCredit(updated || null)
    }
  }, [credits])

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true)
    const total = parseFloat(formAmount)
    const rate = parseFloat(formRate)
    const numInst = parseInt(formInstallments)
    const lateRate = parseFloat(formLateRate) || 0.0
    const installmentAmt = Math.round((total * (1 + rate / 100)) / numInst * 100) / 100

    // 1. Create the contract first
    const today = new Date()
    const endDate = new Date(today)
    endDate.setMonth(endDate.getMonth() + numInst)

    const { data: contract } = await supabase.from('contracts').insert({
      client_id: formClient,
      initial_capital: total,
      current_capital: total,
      currency: 'ARS',
      monthly_rate: rate,
      start_date: today.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      status: 'enviado', // Ready to sign
      template_id: selectedTemplateId || null,
    }).select().single()

    const contractId = contract?.id || null

    // 2. Create the credit
    const { data: credit } = await supabase.from('credits').insert({
      client_id: formClient,
      total_amount: total,
      interest_rate: rate,
      total_installments: numInst,
      status: 'vigente',
      contract_id: contractId,
      daily_late_interest_rate: lateRate,
    }).select().single()

    if (credit) {
      const installments = Array.from({ length: numInst }, (_, i) => {
        const due = new Date(); due.setMonth(due.getMonth() + i + 1)
        return {
          credit_id: credit.id,
          installment_number: i + 1,
          amount: installmentAmt,
          due_date: due.toISOString().split('T')[0],
          status: 'pendiente' as const,
          paid_at: null,
          late_interest: 0,
        }
      })
      await supabase.from('credit_installments').insert(installments)
    }
    setDialogOpen(false); setFormClient(''); setFormAmount(''); setFormRate(''); setFormInstallments(''); setFormLateRate('0.5')
    setSubmitting(false); fetchData()
  }

  const markPaid = async (instId: string, amount: number, lateInterest: number) => {
    const total = amount + lateInterest
    let confirmMsg = `¿Confirmar cobro de esta cuota por ${formatCurrency(amount)}?`
    if (lateInterest > 0) {
      confirmMsg = `¿Confirmar cobro de esta cuota por un total de ${formatCurrency(total)}? (Incluye ${formatCurrency(lateInterest)} por mora diaria acumulada)`
    }
    if (!confirm(confirmMsg)) return

    await supabase.from('credit_installments').update({
      status: 'pagado',
      paid_at: new Date().toISOString(),
      late_interest: lateInterest,
    }).eq('id', instId)
    fetchData()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>

  // Build calendar data for current month
  const now = new Date()
  const allInstallments = credits.flatMap(c =>
    (c.credit_installments || []).map(inst => {
      const dueClean = new Date(inst.due_date)
      dueClean.setHours(0,0,0,0)
      const nowClean = new Date()
      nowClean.setHours(0,0,0,0)
      const daysLate = Math.max(0, Math.floor((nowClean.getTime() - dueClean.getTime()) / (1000 * 60 * 60 * 24)))
      const isOverdue = inst.status === 'pendiente' && daysLate > 0
      const calculatedLateInterest = inst.status !== 'pagado' && daysLate > 0
        ? inst.amount * ((c.daily_late_interest_rate || 0) / 100) * daysLate
        : (inst.late_interest || 0)

      return {
        ...inst,
        clientName: c.profiles?.full_name || 'N/A',
        creditId: c.id,
        dailyRate: c.daily_late_interest_rate || 0,
        daysLate,
        calculatedLateInterest,
        isOverdue,
      }
    })
  )
  const thisMonthInst = allInstallments.filter(inst => {
    const d = new Date(inst.due_date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1"><h1 className="text-2xl lg:text-3xl font-bold">Cartera de Créditos</h1><p className="text-muted-foreground mt-1">Control de préstamos y calendario de cuotas</p></div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-gradient-to-r from-emerald-accent to-emerald-glow text-deep-blue font-semibold shadow-lg shadow-emerald-accent/20" />
            }
          >
            <Plus className="w-4 h-4 mr-2" />Nuevo Crédito
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 max-w-md">
            <DialogHeader><DialogTitle>Otorgar Crédito</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cliente Deudor</Label>
                  <select value={formClient} onChange={e => setFormClient(e.target.value)} required className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm">
                    <option value="">Seleccionar...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name} — {c.dni}</option>)}
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
              <div className="space-y-2"><Label>Capital Prestado</Label><Input type="number" step="0.01" min="1" value={formAmount} onChange={e => setFormAmount(e.target.value)} required className="bg-input/50" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Tasa (%)</Label><Input type="number" step="0.01" min="0.1" value={formRate} onChange={e => setFormRate(e.target.value)} required className="bg-input/50" /></div>
                <div className="space-y-2"><Label>Nº Cuotas</Label><Input type="number" min="1" max="60" value={formInstallments} onChange={e => setFormInstallments(e.target.value)} required className="bg-input/50" /></div>
                <div className="space-y-2"><Label>Mora Diaria (%)</Label><Input type="number" step="0.01" min="0" value={formLateRate} onChange={e => setFormLateRate(e.target.value)} required className="bg-input/50" /></div>
              </div>
              {formAmount && formRate && formInstallments && (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-xs text-muted-foreground">Cuota estimada</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(Math.round((parseFloat(formAmount) * (1 + parseFloat(formRate) / 100)) / parseInt(formInstallments) * 100) / 100)}</p>
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
              {thisMonthInst.map(inst => {
                return (
                  <div key={inst.id} className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${inst.isOverdue ? 'moroso-row bg-red-500/5' : inst.status === 'pagado' ? 'bg-emerald-accent/5' : 'bg-accent/30'}`}>
                    <div className="w-12 h-12 rounded-xl bg-accent/50 flex flex-col items-center justify-center text-xs">
                      <span className="font-bold text-sm">{new Date(inst.due_date).getUTCDate()}</span>
                      <span className="text-muted-foreground text-[10px]">{new Date(inst.due_date).toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' })}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{inst.clientName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">Cuota #{inst.installment_number} · {formatCurrency(Number(inst.amount))}</span>
                        {inst.isOverdue && (
                          <span className="text-[10px] text-red-400 font-bold">+{inst.daysLate}d demorado ({formatCurrency(inst.calculatedLateInterest)} mora)</span>
                        )}
                        {inst.status === 'pagado' && inst.late_interest > 0 && (
                          <span className="text-[10px] text-emerald-400 font-medium">mora cobrada: {formatCurrency(inst.late_interest)}</span>
                        )}
                      </div>
                    </div>
                    {inst.isOverdue ? (
                      <Button
                        size="sm"
                        className="bg-red-500 hover:bg-red-600 text-white font-semibold text-xs h-7 px-3"
                        onClick={() => markPaid(inst.id, Number(inst.amount), inst.calculatedLateInterest)}
                      >
                        Cobrar {formatCurrency(Number(inst.amount) + inst.calculatedLateInterest)}
                      </Button>
                    ) : inst.status === 'pagado' ? (
                      <Badge variant="outline" className="bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Pagado
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => markPaid(inst.id, Number(inst.amount), 0)}
                        className="border-primary/30 text-primary hover:bg-primary/10 text-xs h-7"
                      >
                        Cobrar
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credits List */}
      <Card className="glass-card overflow-hidden">
        <CardHeader><div className="flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /><CardTitle className="text-base">Todos los Créditos</CardTitle></div></CardHeader>
        <Table>
          <TableHeader><TableRow className="border-border/50"><TableHead>Cliente</TableHead><TableHead>Monto</TableHead><TableHead className="hidden sm:table-cell">Tasa</TableHead><TableHead className="hidden md:table-cell">Cuotas</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
          <TableBody>
            {credits.map(credit => (
              <TableRow
                key={credit.id}
                onClick={() => setSelectedCredit(credit)}
                className="border-border/30 hover:bg-accent/50 cursor-pointer animate-fade-in"
              >
                <TableCell className="font-medium text-sm">{credit.profiles?.full_name}</TableCell>
                <TableCell className="text-sm">{formatCurrency(Number(credit.total_amount))}</TableCell>
                <TableCell className="hidden sm:table-cell text-sm">{credit.interest_rate}% (+{credit.daily_late_interest_rate || 0}% mora/día)</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{(credit.credit_installments||[]).filter(i=>i.status==='pagado').length}/{credit.total_installments}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-xs ${credit.status==='moroso'?'bg-red-500/15 text-red-400 border-red-500/30':credit.status==='vigente'?'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30':'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
                    {credit.status==='moroso'&&<AlertTriangle className="w-3 h-3 mr-1"/>}{credit.status.charAt(0).toUpperCase()+credit.status.slice(1)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog: Credit Details & Installments list */}
      <Dialog open={!!selectedCredit} onOpenChange={open => !open && setSelectedCredit(null)}>
        <DialogContent className="glass-card border-border/50 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Detalles del Crédito — {selectedCredit?.profiles?.full_name}
            </DialogTitle>
          </DialogHeader>

          {selectedCredit && (
            <div className="space-y-6 mt-4">
              {/* Credit summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-xs text-muted-foreground font-semibold">Monto Total</p>
                  <p className="text-base font-bold mt-0.5">{formatCurrency(Number(selectedCredit.total_amount))}</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-xs text-muted-foreground font-semibold">Tasa Mensual</p>
                  <p className="text-base font-bold mt-0.5">{selectedCredit.interest_rate}%</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-xs text-muted-foreground font-semibold">Mora Diaria</p>
                  <p className="text-base font-bold mt-0.5">{selectedCredit.daily_late_interest_rate || 0}%</p>
                </div>
                <div className="p-3 rounded-xl bg-accent/20 border border-border/30 animate-fade-in">
                  <p className="text-xs text-muted-foreground font-semibold">Cuotas Pagas</p>
                  <p className="text-base font-bold mt-0.5">
                    {selectedCredit.credit_installments?.filter(i => i.status === 'pagado').length} / {selectedCredit.total_installments}
                  </p>
                </div>
              </div>

              {/* Installments Table */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Listado Completo de Cuotas</h3>
                <div className="border border-border/40 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow className="border-border/30">
                        <TableHead className="w-16">Cuota</TableHead>
                        <TableHead>Vencimiento</TableHead>
                        <TableHead className="text-right">Monto Base</TableHead>
                        <TableHead className="text-right">Mora Acum.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCredit.credit_installments?.sort((a, b) => a.installment_number - b.installment_number).map(inst => {
                        const dueClean = new Date(inst.due_date)
                        dueClean.setHours(0,0,0,0)
                        const nowClean = new Date()
                        nowClean.setHours(0,0,0,0)
                        const daysLate = Math.max(0, Math.floor((nowClean.getTime() - dueClean.getTime()) / (1000 * 60 * 60 * 24)))
                        const isOverdue = inst.status === 'pendiente' && daysLate > 0
                        const lateInterest = inst.status !== 'pagado' && daysLate > 0
                          ? inst.amount * ((selectedCredit.daily_late_interest_rate || 0) / 100) * daysLate
                          : (inst.late_interest || 0)
                        const total = inst.amount + lateInterest

                        return (
                          <TableRow key={inst.id} className="border-border/20">
                            <TableCell className="font-semibold text-center text-xs">#{inst.installment_number}</TableCell>
                            <TableCell className="text-xs">
                              {new Date(inst.due_date).toLocaleDateString('es-AR', { timeZone: 'UTC' })}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{formatCurrency(inst.amount)}</TableCell>
                            <TableCell className={`text-right text-xs tabular-nums ${lateInterest > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                              {lateInterest > 0 ? `+${formatCurrency(lateInterest)}` : '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs font-semibold tabular-nums">{formatCurrency(total)}</TableCell>
                            <TableCell className="text-center">
                              {inst.status === 'pagado' ? (
                                <span className="inline-flex items-center text-[10px] font-semibold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                  Pagado
                                </span>
                              ) : isOverdue ? (
                                <span className="inline-flex items-center text-[10px] font-semibold text-red-400 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 animate-pulse">
                                  Mora ({daysLate}d)
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-[10px] font-semibold text-slate-400 px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-500/20">
                                  Pendiente
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {inst.status === 'pagado' ? (
                                <span className="text-[10px] text-muted-foreground">
                                  Cobrado {inst.paid_at ? new Date(inst.paid_at).toLocaleDateString('es-AR') : ''}
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => markPaid(inst.id, inst.amount, lateInterest)}
                                  className={`h-7 px-2.5 text-xs font-semibold ${isOverdue ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30'}`}
                                >
                                  Cobrar
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
