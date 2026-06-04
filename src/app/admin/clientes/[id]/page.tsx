'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Profile, Contract, AssetValuation, Credit, CreditInstallment } from '@/lib/types'
import { formatCurrency, formatDate, daysRemaining, contractProgress, calculateAccruedInterest } from '@/lib/helpers'
import {
  ArrowLeft, User, Phone, IdCard, Calendar, TrendingUp, Building2, CreditCard,
  FileText, CheckCircle2, AlertTriangle, Clock, RefreshCw, Star, Key, Copy, ExternalLink, Check, Loader2,
} from 'lucide-react'
import { StarRating } from '@/components/StarRating'
import { adminResetPassword } from './actions'

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.id as string

  const [profile, setProfile] = useState<Profile | null>(null)
  const [contracts, setContracts] = useState<(Contract & { assets_valuation?: AssetValuation })[]>([])
  const [assets, setAssets] = useState<AssetValuation[]>([])
  const [credits, setCredits] = useState<(Credit & { credit_installments: CreditInstallment[] })[]>([])
  const [loading, setLoading] = useState(true)

  // Password reset dialog state
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetStatus, setResetStatus] = useState<{ error?: string; success?: boolean; message?: string } | null>(null)
  const [copiedContractId, setCopiedContractId] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = async () => {
    const [profileRes, contractsRes, assetsRes, creditsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', clientId).single(),
      supabase.from('contracts').select('*, assets_valuation(*)').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('assets_valuation').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('credits').select('*, credit_installments(*)').eq('client_id', clientId).order('created_at', { ascending: false }),
    ])

    setProfile(profileRes.data)
    setContracts(contractsRes.data || [])
    setAssets(assetsRes.data || [])
    setCredits((creditsRes.data || []) as (Credit & { credit_installments: CreditInstallment[] })[])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [clientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReinvest = async (contract: Contract) => {
    const totalAccrued = Number(contract.initial_capital) + calculateAccruedInterest(contract)
    const today = new Date()
    const endDate = new Date(today)
    endDate.setFullYear(endDate.getFullYear() + 1)

    // Update old contract
    await supabase.from('contracts').update({ status: 'reinvertido' }).eq('id', contract.id)

    // Create new 12-month contract with accrued capital
    await supabase.from('contracts').insert({
      client_id: contract.client_id,
      asset_id: contract.asset_id,
      initial_capital: Math.round(totalAccrued * 100) / 100,
      current_capital: Math.round(totalAccrued * 100) / 100,
      currency: contract.currency,
      monthly_rate: contract.monthly_rate,
      start_date: today.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      status: 'activo',
    })

    fetchData()
  }

  const handleRequestWithdraw = async (contractId: string) => {
    await supabase.from('contracts').update({
      status: 'retiro_solicitado',
      withdrawal_requested_at: new Date().toISOString(),
    }).eq('id', contractId)
    fetchData()
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setResetStatus({ error: 'La contraseña debe tener al menos 6 caracteres.' })
      return
    }
    setResetLoading(true)
    setResetStatus(null)
    const res = await adminResetPassword(clientId, newPassword)
    if (res.error) {
      setResetStatus({ error: res.error })
    } else {
      setResetStatus({ success: true, message: 'La contraseña ha sido restablecida con éxito.' })
      setNewPassword('')
    }
    setResetLoading(false)
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedContractId(id)
      setTimeout(() => setCopiedContractId(null), 2000)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Cliente no encontrado.</p>
        <Button variant="ghost" onClick={() => router.push('/admin/clientes')} className="mt-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Button>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    activo: 'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30',
    vencido: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    retirado: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    reinvertido: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    vigente: 'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30',
    finalizado: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    moroso: 'bg-red-500/15 text-red-400 border-red-500/30',
    pagado: 'bg-emerald-accent/15 text-emerald-glow border-emerald-accent/30',
    pendiente: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    tasado: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    pendiente_fondos: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    borrador: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    enviado: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/admin/clientes')} className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Button>
      </div>

      {/* Client Info + Tabs layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Client Profile */}
        <Card className="glass-card lg:col-span-1">
          <CardContent className="pt-6">
            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-accent to-emerald-dim mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-emerald-accent/20">
                {profile.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <h2 className="text-xl font-bold mt-4">{profile.full_name}</h2>
              <Badge variant="outline" className="mt-2 text-xs border-primary/30 text-primary">
                {profile.role === 'admin' ? 'Administrador' : 'Inversor'}
              </Badge>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                <IdCard className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">DNI</p>
                  <p className="text-sm font-medium">{profile.dni}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Teléfono</p>
                  <p className="text-sm font-medium">{profile.phone || 'No registrado'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Fecha de Alta</p>
                  <p className="text-sm font-medium">{formatDate(profile.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-accent/50">
                <Star className="w-4 h-4 text-amber-400" />
                <div>
                  <p className="text-xs text-muted-foreground">Nivel de Confianza</p>
                  <div className="flex items-center mt-0.5">
                    <StarRating value={profile.trust_level ?? 5.0} readOnly size="sm" />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="text-center p-3 rounded-xl bg-accent/30">
                <p className="text-xl font-bold text-primary">{contracts.filter(c => c.status === 'activo').length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Activos</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-accent/30">
                <p className="text-xl font-bold">{assets.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Activos</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-accent/30">
                <p className="text-xl font-bold">{credits.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Créditos</p>
              </div>
            </div>

            {/* Account Administration: Reset Password */}
            <div className="mt-6 pt-6 border-t border-border/30">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Administración</h3>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-3 border-red-500/30 text-red-400 hover:bg-red-500/10 gap-1.5"
                onClick={() => {
                  setShowResetDialog(true)
                  setResetStatus(null)
                  setNewPassword('')
                }}
              >
                <Key className="w-3.5 h-3.5" />
                Restablecer Contraseña
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="inversiones" className="space-y-4">
            <TabsList className="bg-accent/50 p-1 w-full grid grid-cols-3">
              <TabsTrigger value="inversiones" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 text-xs sm:text-sm">
                <TrendingUp className="w-3.5 h-3.5" /> Inversiones
              </TabsTrigger>
              <TabsTrigger value="activos" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 text-xs sm:text-sm">
                <Building2 className="w-3.5 h-3.5" /> Activos
              </TabsTrigger>
              <TabsTrigger value="creditos" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-1.5 text-xs sm:text-sm">
                <CreditCard className="w-3.5 h-3.5" /> Créditos
              </TabsTrigger>
            </TabsList>

            {/* Inversiones Tab */}
            <TabsContent value="inversiones" className="space-y-4">
              {contracts.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <TrendingUp className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p>No hay contratos registrados</p>
                  </CardContent>
                </Card>
              ) : (
                contracts.map((contract) => (
                  <Card key={contract.id} className="glass-card animate-fade-in">
                    <CardContent className="pt-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={statusColors[contract.status]}>
                              {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">{contract.currency}</Badge>
                          </div>
                          <p className="text-2xl font-bold mt-2">{formatCurrency(Number(contract.initial_capital), contract.currency)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">Tasa Mensual</p>
                          <p className="text-lg font-bold text-primary">{contract.monthly_rate}%</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Inicio</p>
                          <p className="font-medium">{formatDate(contract.start_date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Vencimiento</p>
                          <p className="font-medium">{formatDate(contract.end_date)}</p>
                        </div>
                      </div>

                      {contract.assets_valuation && (
                        <div className="p-3 rounded-lg bg-accent/30 mb-4">
                          <p className="text-xs text-muted-foreground">Garantía</p>
                          <p className="text-sm font-medium">{contract.assets_valuation.description}</p>
                        </div>
                      )}

                      {contract.status === 'activo' && (
                        <>
                          <div className="mb-3">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Progreso del ciclo</span>
                              <span>{daysRemaining(contract)} días restantes</span>
                            </div>
                            <Progress value={contractProgress(contract)} className="h-2" />
                          </div>
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-3">
                            <p className="text-xs text-muted-foreground">Interés Acumulado Estimado</p>
                            <p className="text-lg font-bold text-primary">
                              +{formatCurrency(calculateAccruedInterest(contract), contract.currency)}
                            </p>
                          </div>
                        </>
                      )}

                      {contract.status === 'activo' && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleReinvest(contract)}
                            className="flex-1 bg-primary/20 text-primary hover:bg-primary/30"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reinvertir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRequestWithdraw(contract.id)}
                            className="flex-1 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Solicitar Retiro
                          </Button>
                        </div>
                      )}

                      {contract.status === 'vencido' && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={() => handleReinvest(contract)}
                            className="flex-1 bg-primary/20 text-primary hover:bg-primary/30"
                          >
                            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reinvertir
                          </Button>
                        </div>
                      )}

                      {contract.status === 'retiro_solicitado' && (
                        <div className="flex items-center gap-2 mt-3 p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                          <Clock className="w-4 h-4 text-orange-400" />
                          <span className="text-xs text-orange-400 font-medium">Retiro solicitado — pendiente de confirmación del administrador</span>
                        </div>
                      )}

                      {/* Enlace de firma si está pendiente de firmar */}
                      {(contract.status === 'enviado' || contract.status === 'borrador') && contract.sign_token && (
                        <div className="mt-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-2">
                          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">Enlace de firma del cliente</p>
                          <div className="flex items-center gap-2">
                            <input
                              readOnly
                              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/firmar/${contract.sign_token}`}
                              className="flex-1 h-8 px-2 rounded border border-blue-500/30 bg-blue-500/5 text-[11px] text-blue-300 focus:outline-none"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/firmar/${contract.sign_token}`, contract.id)}
                              className="h-8 px-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                            >
                              {copiedContractId === contract.id ? (
                                <Check className="w-3.5 h-3.5" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Ver Contrato PDF si ya está disponible */}
                      {contract.contract_pdf_url && (
                        <a href={contract.contract_pdf_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-3 mr-4">
                          <FileText className="w-3.5 h-3.5" /> Descargar Contrato PDF
                        </a>
                      )}
                      
                      {contract.contract_url && contract.contract_url !== contract.contract_pdf_url && (
                        <a href={contract.contract_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-3">
                          <FileText className="w-3.5 h-3.5" /> Ver PDF original
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Activos Tab */}
            <TabsContent value="activos" className="space-y-4">
              {assets.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p>No hay activos registrados</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="glass-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/50">
                        <TableHead>Tipo</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Valuación</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {assets.map((asset) => (
                        <TableRow key={asset.id} className="border-border/30">
                          <TableCell className="capitalize text-sm">{asset.asset_type}</TableCell>
                          <TableCell className="text-sm">{asset.description}</TableCell>
                          <TableCell className="font-medium text-sm">{formatCurrency(Number(asset.market_value))}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${statusColors[asset.status] || ''}`}>
                              {asset.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>

            {/* Créditos Tab */}
            <TabsContent value="creditos" className="space-y-4">
              {credits.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p>No hay créditos registrados</p>
                  </CardContent>
                </Card>
              ) : (
                credits.map((credit) => (
                  <Card key={credit.id} className="glass-card animate-fade-in">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {formatCurrency(Number(credit.total_amount))} @ {credit.interest_rate}%
                        </CardTitle>
                        <Badge variant="outline" className={statusColors[credit.status]}>
                          {credit.status === 'moroso' && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {credit.status.charAt(0).toUpperCase() + credit.status.slice(1)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50 text-xs">
                            <TableHead className="text-xs">Cuota</TableHead>
                            <TableHead className="text-xs">Monto</TableHead>
                            <TableHead className="text-xs">Vencimiento</TableHead>
                            <TableHead className="text-xs">Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(credit.credit_installments || [])
                            .sort((a, b) => a.installment_number - b.installment_number)
                            .map((inst) => {
                              const isOverdue = inst.status === 'pendiente' && new Date(inst.due_date) < new Date()
                              return (
                                <TableRow
                                  key={inst.id}
                                  className={`border-border/30 text-sm ${isOverdue ? 'moroso-row' : ''}`}
                                >
                                  <TableCell className="font-medium">#{inst.installment_number}</TableCell>
                                  <TableCell>{formatCurrency(Number(inst.amount))}</TableCell>
                                  <TableCell>{formatDate(inst.due_date)}</TableCell>
                                  <TableCell>
                                    {isOverdue ? (
                                      <Badge className="bg-red-500/20 text-red-400 border border-red-500/30 text-xs animate-pulse">
                                        <AlertTriangle className="w-3 h-3 mr-1" /> MOROSO
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className={`text-xs ${statusColors[inst.status]}`}>
                                        {inst.status === 'pagado' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                        {inst.status === 'pendiente' && <Clock className="w-3 h-3 mr-1" />}
                                        {inst.status.charAt(0).toUpperCase() + inst.status.slice(1)}
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Dialog: Restablecer Contraseña */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="glass-card border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-red-400" />
              Restablecer Contraseña
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleResetPassword} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase font-semibold">Nueva Contraseña</Label>
              <Input
                type="password"
                required
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="bg-input/50"
              />
            </div>

            {resetStatus?.error && (
              <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {resetStatus.error}
              </div>
            )}

            {resetStatus?.success && (
              <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                {resetStatus.message || '¡Contraseña restablecida exitosamente!'}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetDialog(false)}
                className="flex-1"
              >
                Cerrar
              </Button>
              <Button
                type="submit"
                disabled={resetLoading}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold"
              >
                {resetLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Confirmar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
