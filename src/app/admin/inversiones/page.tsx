'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  formatCurrency,
  formatDate,
  calculateCompoundCapital,
  getContractStatusLabel,
  getContractStatusColor,
  projectCapital,
  fillContractTemplate,
  numberToWords,
  formatWhatsAppUrl,
} from '@/lib/helpers'
import type { Contract, Profile, ContractTemplate } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import Link from 'next/link'
import {
  TrendingUp,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Eye,
  Send,
  RefreshCw,
  ArrowRight,
  DollarSign,
  Calendar,
  Percent,
  Trash2,
  MessageCircle,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ContractWithProfile = Contract & { 
  profiles: { full_name: string; dni: string; id: string; phone?: string | null }
  assets_valuation?: { description: string; asset_type: string } | null
}
type FilterKey = 'todas' | 'activas' | 'borradores' | 'enviados' | 'pendiente_fondos' | 'consignaciones' | 'retiros' | 'vencidas'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────────────────────────────────────────
export default function InversionesPage() {
  const supabase = createClient()

  // ── shared state ──────────────────────────────────────────────────────────
  const [clients, setClients] = useState<Profile[]>([])
  const [contracts, setContracts] = useState<ContractWithProfile[]>([])
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingContracts, setLoadingContracts] = useState(true)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  // ── form state (Tab 1) ────────────────────────────────────────────────────
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [capital, setCapital] = useState('')
  const [rate, setRate] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(addDays(todayISO(), 30))
  const [consignacionDias, setConsignacionDias] = useState<number>(60)
  const [consignacionInicio, setConsignacionInicio] = useState(todayISO())
  const [activeTab, setActiveTab] = useState('nueva')
  const [clientAssets, setClientAssets] = useState<any[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string>('')

  // ── contract dialog ───────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savedContract, setSavedContract] = useState<ContractWithProfile | null>(null)
  const [signingLink, setSigningLink] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  // ── tab 2 state ───────────────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterKey>('todas')
  const [withdrawalConfirming, setWithdrawalConfirming] = useState<string | null>(null)
  const [withdrawalSuccess, setWithdrawalSuccess] = useState<string | null>(null)
  const [signingDialogContract, setSigningDialogContract] = useState<ContractWithProfile | null>(null)
  const [copiedSigningLink, setCopiedSigningLink] = useState(false)

  // ── fetch data ────────────────────────────────────────────────────────────
  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'investor')
      .order('full_name')
    setClients(data || [])
    setLoadingClients(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchContracts = useCallback(async () => {
    setLoadingContracts(true)
    const { data } = await supabase
      .from('contracts')
      .select('*, profiles(full_name, dni, id, phone), assets_valuation(description, asset_type)')
      .order('created_at', { ascending: false })
    setContracts((data || []) as ContractWithProfile[])
    setLoadingContracts(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true)
    const { data } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('type', 'inversion')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    const tmpls = data || []
    setTemplates(tmpls as ContractTemplate[])
    if (tmpls.length > 0) {
      setSelectedTemplateId(tmpls[0].id)
    }
    setLoadingTemplates(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchClients()
    fetchContracts()
    fetchTemplates()
  }, [fetchClients, fetchContracts, fetchTemplates])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const cid = params.get('client_id')
      if (cid) {
        setSelectedClientId(cid)
        setActiveTab('nueva')
      }
    }
  }, [clients])

  useEffect(() => {
    if (!selectedClientId) {
      setClientAssets([])
      setSelectedAssetId('')
      return
    }

    const fetchClientAssets = async () => {
      const { data, error } = await supabase
        .from('assets_valuation')
        .select('*')
        .eq('client_id', selectedClientId)
        .eq('status', 'tasado')
        .order('created_at', { ascending: false })
      if (!error && data) {
        setClientAssets(data)
      } else {
        setClientAssets([])
      }
    }

    fetchClientAssets()
    setSelectedAssetId('')
  }, [selectedClientId, supabase])

  // ── projection table ──────────────────────────────────────────────────────
  const capitalNum = parseFloat(capital) || 0
  const rateNum = parseFloat(rate) || 0
  const projectionMonths = [1, 2, 3, 6, 12]
  const projection =
    capitalNum > 0 && rateNum > 0
      ? projectCapital(capitalNum, rateNum, 12).filter((p) =>
          projectionMonths.includes(p.month)
        )
      : []

  // ── selected client label ─────────────────────────────────────────────────
  const selectedClient = clients.find((c) => c.id === selectedClientId)

  // ── Tab 2 filter ──────────────────────────────────────────────────────────
  const filteredContracts = contracts.filter((c) => {
    if (activeFilter === 'todas') return true
    if (activeFilter === 'activas') return c.status === 'activo'
    if (activeFilter === 'borradores') return c.status === 'borrador'
    if (activeFilter === 'enviados') return c.status === 'enviado'
    if (activeFilter === 'pendiente_fondos') return c.status === 'pendiente_fondos'
    if (activeFilter === 'consignaciones') return c.status === 'en_consignacion'
    if (activeFilter === 'retiros') return c.status === 'retiro_solicitado'
    if (activeFilter === 'vencidas') return c.status === 'vencido'
    return true
  })

  const pendingWithdrawals = contracts.filter((c) => c.status === 'retiro_solicitado')
  const overdueConsignments = contracts.filter(
    (c) => c.status === 'en_consignacion' && new Date(c.start_date) <= new Date()
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────
  async function handleSaveDraft() {
    if (!selectedClientId || !capitalNum || !rateNum) return
    setSubmitting(true)
    const { data: contract, error } = await supabase
      .from('contracts')
      .insert({
        client_id: selectedClientId,
        asset_id: selectedAssetId || null,
        initial_capital: capitalNum,
        current_capital: capitalNum,
        currency,
        monthly_rate: rateNum,
        start_date: startDate,
        end_date: endDate,
        status: 'borrador',
        template_id: selectedTemplateId || null,
        consignacion_dias: selectedAssetId ? consignacionDias : null,
        consignacion_inicio: selectedAssetId ? consignacionInicio : null,
        consignacion_fin: selectedAssetId ? startDate : null,
      })
      .select('*, profiles(full_name, dni, id), assets_valuation(description, asset_type)')
      .single()
    setSubmitting(false)
    if (!error && contract) {
      setSavedContract(contract as ContractWithProfile)
      setSigningLink('')
      await fetchContracts()
    }
  }

  async function handleSendToClient() {
    if (!selectedClientId || !capitalNum || !rateNum) return
    setSubmitting(true)

    let contractData = savedContract

    if (!contractData) {
      const { data: inserted, error } = await supabase
        .from('contracts')
        .insert({
          client_id: selectedClientId,
          asset_id: selectedAssetId || null,
          initial_capital: capitalNum,
          current_capital: capitalNum,
          currency,
          monthly_rate: rateNum,
          start_date: startDate,
          end_date: endDate,
          status: 'enviado',
          template_id: selectedTemplateId || null,
          consignacion_dias: selectedAssetId ? consignacionDias : null,
          consignacion_inicio: selectedAssetId ? consignacionInicio : null,
          consignacion_fin: selectedAssetId ? startDate : null,
        })
        .select('*, profiles(full_name, dni, id), assets_valuation(description, asset_type)')
        .single()
      if (!error && inserted) {
        contractData = inserted as ContractWithProfile
      }
    } else {
      const { data: updated, error } = await supabase
        .from('contracts')
        .update({ status: 'enviado' })
        .eq('id', contractData.id)
        .select('*, profiles(full_name, dni, id), assets_valuation(description, asset_type)')
        .single()
      if (!error && updated) contractData = updated as ContractWithProfile
    }

    setSubmitting(false)
    if (contractData) {
      setSavedContract(contractData)
      const link = contractData.sign_token
        ? `${window.location.origin}/firmar/${contractData.sign_token}`
        : ''
      setSigningLink(link)
      await fetchContracts()
    }
  }

  async function handleConfirmWithdrawal(contractId: string) {
    setWithdrawalConfirming(contractId)
    const { error } = await supabase
      .from('contracts')
      .update({
        status: 'retirado',
        withdrawal_confirmed_at: new Date().toISOString(),
      })
      .eq('id', contractId)
    if (!error) {
      setWithdrawalSuccess(contractId)
      await fetchContracts()
    }
    setWithdrawalConfirming(null)
  }

  async function handleConfirmPayment(contractId: string) {
    setWithdrawalConfirming(contractId) // reuse loading state
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'activo' })
      .eq('id', contractId)
    if (!error) {
      // Register event
      await supabase.from('contract_events').insert({
        contract_id: contractId,
        event_type: 'funds_confirmed',
        metadata: { confirmed_at: new Date().toISOString() },
      })

      // Add asset to assets_available if contract has asset_id
      const contractData = contracts.find(c => c.id === contractId)
      if (contractData?.asset_id) {
        const { data: assetVal } = await supabase
          .from('assets_valuation')
          .select('*')
          .eq('id', contractData.asset_id)
          .single()

        if (assetVal) {
          const { data: existingAvail } = await supabase
            .from('assets_available')
            .select('id')
            .eq('asset_valuation_id', contractData.asset_id)
            .maybeSingle()

          if (!existingAvail) {
            const capitalizedType = assetVal.asset_type.charAt(0).toUpperCase() + assetVal.asset_type.slice(1)
            await supabase.from('assets_available').insert({
              asset_valuation_id: contractData.asset_id,
              title: `${capitalizedType} - ${assetVal.description}`,
              description: `Recibido como forma de pago / inversión de ${contractData.profiles?.full_name || 'cliente'}.`,
              asset_type: assetVal.asset_type,
              listed_value: assetVal.market_value,
              currency: assetVal.currency || 'USD',
              status: 'disponible'
            })
          }
        }
      }

      setWithdrawalSuccess(contractId)
      await fetchContracts()
    }
    setWithdrawalConfirming(null)
  }

  async function handleActivateConsignment(contractId: string) {
    setWithdrawalConfirming(contractId)
    const todayStr = todayISO()
    const nextVenc = addDays(todayStr, 30)
    const { error } = await supabase
      .from('contracts')
      .update({
        status: 'activo',
        start_date: todayStr,
        end_date: nextVenc,
      })
      .eq('id', contractId)
    if (!error) {
      await supabase.from('contract_events').insert({
        contract_id: contractId,
        event_type: 'funds_confirmed',
        metadata: { activated_at: new Date().toISOString() },
      })
      setWithdrawalSuccess(contractId)
      await fetchContracts()
    }
    setWithdrawalConfirming(null)
  }

  async function handleDeleteDraft(contractId: string) {
    if (!confirm('¿Seguro que querés eliminar este borrador?')) return
    await supabase.from('contracts').delete().eq('id', contractId)
    await fetchContracts()
  }

  function copyToClipboard(text: string, setter: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setter(true)
      setTimeout(() => setter(false), 2000)
    })
  }

  function openSigningDialog(contract: ContractWithProfile) {
    setSigningDialogContract(contract)
    setCopiedSigningLink(false)
  }

  const signingLinkForContract = (contract: ContractWithProfile) =>
    contract.sign_token ? `${window.location.origin}/firmar/${contract.sign_token}` : ''

  const getFilledContractContent = () => {
    const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
    if (!selectedTemplate) return '<p class="text-center text-muted-foreground">Ninguna plantilla seleccionada</p>'
    
    return fillContractTemplate(selectedTemplate.content, {
      fecha_contrato: formatDate(startDate),
      nombre_cliente: selectedClient ? selectedClient.full_name : '—',
      dni_cliente: selectedClient ? selectedClient.dni : '—',
      domicilio_cliente: selectedClient ? (selectedClient.address || '—') : '—',
      moneda: currency === 'ARS' ? '$ ARS' : '$ USD',
      monto_inicial: formatCurrency(capitalNum, currency),
      monto_letras: numberToWords(capitalNum),
      tasa_mensual: String(rateNum),
      fecha_inicio: formatDate(startDate),
      fecha_firma: 'Pendiente de firma',
      hora_firma: '',
      ip_firma: '',
    }, selectedTemplate.name)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold gradient-text">
            Módulo de Inversiones
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Gestión completa de contratos de inversión con interés compuesto
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl glass-card">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-emerald-400">
            {contracts.filter((c) => c.status === 'activo').length} activos
          </span>
        </div>
      </div>

      {/* ── Pending Withdrawals Alert ─────────────────────────────────────── */}
      {pendingWithdrawals.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400">
              {pendingWithdrawals.length} retiro{pendingWithdrawals.length > 1 ? 's' : ''} pendiente
              {pendingWithdrawals.length > 1 ? 's' : ''} de confirmación
            </p>
            <p className="text-xs text-orange-400/70 mt-0.5">
              {pendingWithdrawals.map((c) => c.profiles?.full_name).join(', ')}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 shrink-0"
            onClick={() => setActiveFilter('retiros')}
          >
            Ver retiros
          </Button>
        </div>
      )}

      {/* ── Overdue/Completed Consignments Alert ───────────────────────────── */}
      {overdueConsignments.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-orange-400">
              {overdueConsignments.length} consignación{overdueConsignments.length > 1 ? 'es' : ''} cumplida{overdueConsignments.length > 1 ? 's' : ''} lista{overdueConsignments.length > 1 ? 's' : ''} para iniciar inversión
            </p>
            <p className="text-xs text-orange-400/70 mt-0.5">
              {overdueConsignments.map((c) => c.profiles?.full_name).join(', ')}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 shrink-0"
            onClick={() => {
              setActiveFilter('consignaciones')
              setActiveTab('todas')
            }}
          >
            Ver consignaciones
          </Button>
        </div>
      )}

      {/* ── Main Tabs ─────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="nueva" className="gap-2">
            <FileText className="w-4 h-4" />
            Nueva Inversión
          </TabsTrigger>
          <TabsTrigger value="todas" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Todas las Inversiones
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 1 — Nueva Inversión                                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="nueva">
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mt-2">
            {/* ── Form ──────────────────────────────────────────────────── */}
            <div className="xl:col-span-3">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    Nuevo Contrato de Inversión
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Cliente + Plantilla */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        Cliente Inversor
                      </Label>
                      {loadingClients ? (
                        <div className="h-10 rounded-md bg-accent/30 animate-pulse" />
                      ) : (
                        <select
                          value={selectedClientId}
                          onChange={(e) => setSelectedClientId(e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                        >
                          <option value="">Seleccionar inversor...</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.full_name} — DNI {c.dni}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        Plantilla de Contrato
                      </Label>
                      {loadingTemplates ? (
                        <div className="h-10 rounded-md bg-accent/30 animate-pulse" />
                      ) : (
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => setSelectedTemplateId(e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                        >
                          {templates.length === 0 ? (
                            <option value="">No hay plantillas activas</option>
                          ) : (
                            templates.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))
                          )}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Activo del Cliente */}
                  {selectedClientId && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        Recibir Activo como Inversión (Opcional)
                      </Label>
                      <select
                        value={selectedAssetId}
                        onChange={(e) => {
                          const assetId = e.target.value
                          setSelectedAssetId(assetId)
                          if (assetId) {
                            const asset = clientAssets.find((a) => a.id === assetId)
                            if (asset) {
                              setCapital(asset.market_value.toString())
                              if (asset.currency === 'ARS' || asset.currency === 'USD') {
                                setCurrency(asset.currency)
                              }
                              // Set default consignment
                              const todayStr = todayISO()
                              setConsignacionInicio(todayStr)
                              setConsignacionDias(60)
                              const consignFin = addDays(todayStr, 60)
                              setStartDate(consignFin)
                              setEndDate(addDays(consignFin, 30))
                            }
                          } else {
                            setCapital('')
                            setStartDate(todayISO())
                            setEndDate(addDays(todayISO(), 30))
                          }
                        }}
                        className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                      >
                        <option value="">Ninguno (Aporte en Efectivo / Transferencia)</option>
                        {clientAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.asset_type.charAt(0).toUpperCase() + asset.asset_type.slice(1)}: {asset.description} ({formatCurrency(asset.market_value, asset.currency || 'USD')})
                          </option>
                        ))}
                      </select>
                      {selectedAssetId && (
                        <p className="text-xs text-blue-400 font-medium mt-1">
                          Se utilizará el valor tasado del activo ({formatCurrency(parseFloat(capital) || 0, currency)}) como capital inicial del contrato. Al firmarse el contrato, este activo se agregará automáticamente a Activos Disponibles y comenzará el período de consignación.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Consignación de Activo */}
                  {selectedAssetId && (
                    <div className="p-4 rounded-xl border border-orange-500/20 bg-orange-500/5 space-y-4 animate-fade-in">
                      <p className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                        Período de Consignación de Venta
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground font-semibold">
                            Inicio Consignación
                          </Label>
                          <input
                            type="date"
                            value={consignacionInicio}
                            onChange={(e) => {
                              const newInicio = e.target.value
                              setConsignacionInicio(newInicio)
                              const nextStart = addDays(newInicio, consignacionDias)
                              setStartDate(nextStart)
                              setEndDate(addDays(nextStart, 30))
                            }}
                            className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground font-semibold">
                            Duración de Consignación
                          </Label>
                          <select
                            value={consignacionDias}
                            onChange={(e) => {
                              const newDias = Number(e.target.value)
                              setConsignacionDias(newDias)
                              const nextStart = addDays(consignacionInicio, newDias)
                              setStartDate(nextStart)
                              setEndDate(addDays(nextStart, 30))
                            }}
                            className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                          >
                            <option value={30}>30 días</option>
                            <option value={60}>60 días (Estándar)</option>
                            <option value={90}>90 días</option>
                            <option value={120}>120 días</option>
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        La consignación finaliza el <span className="font-semibold text-orange-400">{formatDate(startDate)}</span>. En esa fecha se dará por iniciada la inversión.
                      </p>
                    </div>
                  )}

                  {/* Moneda */}
                  <div className="space-y-2">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Moneda
                    </Label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => !selectedAssetId && setCurrency('ARS')}
                        disabled={!!selectedAssetId}
                        className={`flex-1 h-10 rounded-md border text-sm font-semibold transition-all ${
                          currency === 'ARS'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                            : 'border-border bg-input/30 text-muted-foreground hover:bg-accent/50'
                        } ${selectedAssetId ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        $ ARS — Pesos
                      </button>
                      <button
                        type="button"
                        onClick={() => !selectedAssetId && setCurrency('USD')}
                        disabled={!!selectedAssetId}
                        className={`flex-1 h-10 rounded-md border text-sm font-semibold transition-all ${
                          currency === 'USD'
                            ? 'bg-blue-500/15 border-blue-500/40 text-blue-400'
                            : 'border-border bg-input/30 text-muted-foreground hover:bg-accent/50'
                        } ${selectedAssetId ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        $ USD — Dólares
                      </button>
                    </div>
                  </div>

                  {/* Capital + Tasa */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        Capital Inicial
                      </Label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        value={capital}
                        onChange={(e) => setCapital(e.target.value)}
                        placeholder="0.00"
                        readOnly={!!selectedAssetId}
                        className={`w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                          selectedAssetId ? 'opacity-70 cursor-not-allowed bg-accent/20' : ''
                        }`}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                        <Percent className="w-3 h-3" />
                        Tasa Mensual (%)
                      </Label>
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        max="100"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        placeholder="3.5"
                        className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  {/* Fechas de Inicio y Vencimiento */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Fecha de Inicio {selectedAssetId && 'de Inversión'}
                      </Label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          const newStart = e.target.value
                          setStartDate(newStart)
                          if (!selectedAssetId) {
                            setEndDate(addDays(newStart, 30))
                          }
                        }}
                        readOnly={!!selectedAssetId}
                        className={`w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                          selectedAssetId ? 'opacity-70 cursor-not-allowed bg-accent/20' : ''
                        }`}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Primer Vencimiento
                      </Label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {selectedAssetId 
                      ? 'La fecha de inicio se calcula al fin de la consignación. El primer vencimiento se puede personalizar.'
                      : 'Por defecto, el vencimiento es a 30 días, pero podés elegir una fecha personalizada (ej: 35 o 40 días).'}
                  </p>

                  {/* CTA */}
                  <Button
                    onClick={() => {
                      setSavedContract(null)
                      setSigningLink('')
                      setDialogOpen(true)
                    }}
                    disabled={!selectedClientId || !capitalNum || !rateNum}
                    className="w-full h-11 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Previsualizar Contrato
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* ── Projection Table ───────────────────────────────────────── */}
            <div className="xl:col-span-2">
              <Card className="glass-card sticky top-24">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    Proyección de Capital
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {projection.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <TrendingUp className="w-12 h-12 mb-3 text-muted-foreground/20" />
                      <p className="text-sm">Ingrese capital y tasa</p>
                      <p className="text-xs mt-1">para ver la proyección a 12 meses</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Summary header */}
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
                        <p className="text-xs text-muted-foreground">Capital inicial</p>
                        <p className="text-lg font-bold gradient-text">
                          {formatCurrency(capitalNum, currency)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          @ {rateNum}% mensual · interés compuesto
                        </p>
                      </div>

                      {/* Table */}
                      <div className="overflow-hidden rounded-xl border border-border/50">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-accent/30 border-b border-border/30">
                              <th className="px-3 py-2 text-left text-muted-foreground font-medium">
                                Mes
                              </th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">
                                Capital
                              </th>
                              <th className="px-3 py-2 text-right text-muted-foreground font-medium">
                                Ganancia
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {projection.map((p, i) => (
                              <tr
                                key={p.month}
                                className={`border-b border-border/20 transition-colors ${
                                  p.month === 12
                                    ? 'bg-emerald-500/5'
                                    : i % 2 === 0
                                    ? 'bg-transparent'
                                    : 'bg-accent/10'
                                }`}
                              >
                                <td className="px-3 py-2.5 font-medium">
                                  {p.month === 12 ? (
                                    <span className="text-emerald-400 font-bold">
                                      Mes {p.month} ★
                                    </span>
                                  ) : (
                                    `Mes ${p.month}`
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold">
                                  {formatCurrency(p.capital, currency)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-emerald-400 font-medium">
                                  +{formatCurrency(p.interest, currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <p className="text-[10px] text-muted-foreground text-center">
                        Fórmula: capital × (1 + tasa/100)^meses
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* TAB 2 — Todas las Inversiones                                   */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="todas">
          <div className="space-y-4 mt-2">
            {/* ── Filter Buttons ─────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'todas', label: 'Todas', count: contracts.length },
                  {
                    key: 'activas',
                    label: 'Activas',
                    count: contracts.filter((c) => c.status === 'activo').length,
                  },
                  {
                    key: 'borradores',
                    label: 'Borradores',
                    count: contracts.filter((c) => c.status === 'borrador').length,
                  },
                  {
                    key: 'enviados',
                    label: 'Enviadas',
                    count: contracts.filter((c) => c.status === 'enviado').length,
                  },
                  {
                    key: 'pendiente_fondos',
                    label: 'Pendientes de Pago',
                    count: contracts.filter((c) => c.status === 'pendiente_fondos').length,
                  },
                  {
                    key: 'consignaciones',
                    label: 'En Consignación',
                    count: contracts.filter((c) => c.status === 'en_consignacion').length,
                    alert: overdueConsignments.length > 0,
                  },
                  {
                    key: 'retiros',
                    label: 'Retiros Pendientes',
                    count: pendingWithdrawals.length,
                    alert: pendingWithdrawals.length > 0,
                  },
                  {
                    key: 'vencidas',
                    label: 'Vencidas',
                    count: contracts.filter((c) => c.status === 'vencido').length,
                  },
                ] as { key: FilterKey; label: string; count: number; alert?: boolean }[]
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(f.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    activeFilter === f.key
                      ? f.alert
                        ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
                        : 'bg-primary/20 border-primary/40 text-primary'
                      : 'border-border bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  {f.label}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      activeFilter === f.key
                        ? f.alert
                          ? 'bg-orange-500/30 text-orange-300'
                          : 'bg-primary/30 text-primary'
                        : 'bg-accent/50 text-muted-foreground'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              ))}

              <button
                onClick={fetchContracts}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-all"
              >
                <RefreshCw className="w-3 h-3" />
                Actualizar
              </button>
            </div>

            {/* ── Table ─────────────────────────────────────────────────── */}
            <Card className="glass-card">
              <CardContent className="p-0">
                {loadingContracts ? (
                  <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  </div>
                ) : filteredContracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <TrendingUp className="w-12 h-12 mb-3 text-muted-foreground/20" />
                    <p className="text-sm">Sin contratos para este filtro</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Cliente
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Estado
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Capital Inicial
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Capital Actual
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Tasa
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Inicio
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/20">
                        {filteredContracts.map((contract) => {
                          const currentCapital = calculateCompoundCapital(contract)
                          const gain = currentCapital - contract.initial_capital
                          const isRetiro = contract.status === 'retiro_solicitado'
                          const isBorrador = contract.status === 'borrador'
                          const isEnviado = contract.status === 'enviado'

                          return (
                            <tr
                              key={contract.id}
                              className={`group hover:bg-accent/20 transition-colors ${
                                isRetiro ? 'bg-orange-500/5' : ''
                              }`}
                            >
                              {/* Cliente */}
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <p className="font-medium text-foreground">
                                    {contract.profiles?.full_name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    DNI {contract.profiles?.dni}
                                  </p>
                                  {contract.assets_valuation && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">
                                      📦 Activo: {contract.assets_valuation.description}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Estado */}
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-semibold ${getContractStatusColor(
                                    contract.status
                                  )}`}
                                >
                                  {isRetiro && (
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                  )}
                                  {getContractStatusLabel(contract.status)}
                                </span>
                              </td>

                              {/* Capital Inicial */}
                              <td className="px-4 py-3 text-right tabular-nums">
                                <div>
                                  <p className="font-medium">
                                    {formatCurrency(
                                      Number(contract.initial_capital),
                                      contract.currency
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {contract.currency}
                                  </p>
                                </div>
                              </td>

                              {/* Capital Actual (compound real-time) */}
                              <td className="px-4 py-3 text-right tabular-nums">
                                {contract.status === 'activo' || contract.status === 'retiro_solicitado' ? (
                                  <div>
                                    <p className="font-bold text-emerald-400">
                                      {formatCurrency(currentCapital, contract.currency)}
                                    </p>
                                    {gain > 0 && (
                                      <p className="text-xs text-emerald-400/70">
                                        +{formatCurrency(gain, contract.currency)}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-xs">—</span>
                                )}
                              </td>

                              {/* Tasa */}
                              <td className="px-4 py-3 text-right">
                                <span className="font-semibold text-primary">
                                  {contract.monthly_rate}%
                                </span>
                                <p className="text-xs text-muted-foreground">mensual</p>
                              </td>

                              {/* Inicio */}
                              <td className="px-4 py-3">
                                {contract.status === 'en_consignacion' ? (
                                  <div>
                                    <p className="text-sm font-medium text-orange-400">En consignación ({contract.consignacion_dias || 60} días)</p>
                                    <p className="text-xs text-muted-foreground">
                                      inicia {formatDate(contract.start_date)}
                                    </p>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="text-sm">{formatDate(contract.start_date)}</p>
                                    <p className="text-xs text-muted-foreground">
                                      vence {formatDate(contract.end_date)}
                                    </p>
                                  </div>
                                )}
                              </td>

                              {/* Acciones */}
                              <td className="px-4 py-3">
                                <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                  {/* Ver Cliente */}
                                  <Link href={`/admin/clientes/${contract.client_id}`}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 border-border/50 text-xs gap-1"
                                    >
                                      <ArrowRight className="w-3 h-3" />
                                      <span className="hidden sm:inline">Ver cliente</span>
                                    </Button>
                                  </Link>

                                  {/* WhatsApp */}
                                  {contract.profiles?.phone && formatWhatsAppUrl(contract.profiles.phone) && (
                                    <a
                                      href={formatWhatsAppUrl(contract.profiles.phone)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="WhatsApp"
                                      className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                                    >
                                      <MessageCircle className="w-3 h-3" />
                                    </a>
                                  )}

                                  {/* Confirmar Retiro */}
                                  {isRetiro && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleConfirmWithdrawal(contract.id)}
                                      disabled={withdrawalConfirming === contract.id}
                                      className="h-7 px-2.5 bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 text-xs font-semibold gap-1"
                                    >
                                      {withdrawalConfirming === contract.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : withdrawalSuccess === contract.id ? (
                                        <Check className="w-3 h-3" />
                                      ) : (
                                        <CheckCircle2 className="w-3 h-3" />
                                      )}
                                      Confirmar retiro
                                    </Button>
                                  )}

                                  {/* Confirmar Pago (si pendiente de fondos) */}
                                  {contract.status === 'pendiente_fondos' && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleConfirmPayment(contract.id)}
                                      disabled={withdrawalConfirming === contract.id}
                                      className="h-7 px-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 text-xs font-semibold gap-1"
                                    >
                                      {withdrawalConfirming === contract.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : withdrawalSuccess === contract.id ? (
                                        <Check className="w-3 h-3" />
                                      ) : (
                                        <CheckCircle2 className="w-3 h-3" />
                                      )}
                                      Confirmar pago
                                    </Button>
                                  )}

                                  {/* Activar Consignación */}
                                  {contract.status === 'en_consignacion' && (
                                    <Button
                                      size="sm"
                                      onClick={() => handleActivateConsignment(contract.id)}
                                      disabled={withdrawalConfirming === contract.id}
                                      className="h-7 px-2.5 bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30 text-xs font-semibold gap-1 animate-pulse"
                                    >
                                      {withdrawalConfirming === contract.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : withdrawalSuccess === contract.id ? (
                                        <Check className="w-3 h-3" />
                                      ) : (
                                        <CheckCircle2 className="w-3 h-3" />
                                      )}
                                      Activar Inversión
                                    </Button>
                                  )}

                                  {/* Enviar borrador a cliente */}
                                  {isBorrador && (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() => openSigningDialog(contract)}
                                        className="h-7 px-2.5 bg-blue-500/15 border border-blue-500/30 text-blue-400 hover:bg-blue-500/25 text-xs gap-1"
                                      >
                                        <Send className="w-3 h-3" />
                                        Enviar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleDeleteDraft(contract.id)}
                                        className="h-7 px-2 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs gap-1"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        Eliminar
                                      </Button>
                                    </>
                                  )}

                                  {/* Copiar link de firma si ya enviado */}
                                  {isEnviado && contract.sign_token && (
                                    <Button
                                      size="sm"
                                      onClick={() => openSigningDialog(contract)}
                                      className="h-7 px-2.5 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 text-xs gap-1"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                      Link firma
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CONTRACT PREVIEW DIALOG                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-primary" />
              Previsualización del Contrato
            </DialogTitle>
          </DialogHeader>

          {/* Contract preview body */}
          <div className="space-y-4">
            {/* Status indicator */}
            {savedContract && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-medium ${
                  savedContract.status === 'enviado'
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {savedContract.status === 'enviado'
                  ? 'Contrato enviado al cliente'
                  : 'Borrador guardado exitosamente'}
              </div>
            )}

            {/* Contract document preview */}
            <div className="p-5 rounded-xl border border-border/40 bg-slate-950/80 max-h-[380px] overflow-y-auto">
              <div
                className="contract-content-preview text-slate-300 font-sans text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: getFilledContractContent() }}
              />
            </div>

            {/* Signing link (shown after sending) */}
            {signingLink && (
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-2">
                <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                  Enlace de firma para el cliente
                </p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={signingLink}
                    className="flex-1 h-9 px-3 rounded-md border border-blue-500/30 bg-blue-500/5 text-xs text-blue-300 focus:outline-none"
                  />
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(signingLink, setCopiedLink)}
                    className="h-9 px-3 bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
                  >
                    {copiedLink ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {copiedLink && (
                  <p className="text-xs text-blue-400/70">¡Enlace copiado al portapapeles!</p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="-mx-4 -mb-4 bg-muted/30 px-4 pb-4 pt-3 flex flex-col sm:flex-row gap-2 rounded-b-xl border-t border-border/30">
            {!savedContract || savedContract.status === 'borrador' ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={submitting || !selectedClientId || !capitalNum || !rateNum}
                  className="flex-1 border-border/50 gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Guardar Borrador
                </Button>
                <Button
                  onClick={handleSendToClient}
                  disabled={submitting || !selectedClientId || !capitalNum || !rateNum}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold hover:from-blue-400 hover:to-blue-500 gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Enviar al Cliente
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false)
                  setSavedContract(null)
                  setSigningLink('')
                  // reset form
                  setSelectedClientId('')
                  setCapital('')
                  setRate('')
                  setStartDate(todayISO())
                  setCurrency('ARS')
                }}
                className="w-full border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Listo — Nueva Inversión
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SIGNING LINK DIALOG (for table actions)                              */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!signingDialogContract}
        onOpenChange={(open) => {
          if (!open) setSigningDialogContract(null)
        }}
      >
        <DialogContent className="sm:max-w-md glass-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ExternalLink className="w-4 h-4 text-blue-400" />
              Enlace de Firma
            </DialogTitle>
          </DialogHeader>

          {signingDialogContract && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-accent/20 border border-border/30 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente:</span>
                  <span className="font-medium">{signingDialogContract.profiles?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capital:</span>
                  <span className="font-medium">
                    {formatCurrency(
                      Number(signingDialogContract.initial_capital),
                      signingDialogContract.currency
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded border ${getContractStatusColor(
                      signingDialogContract.status
                    )}`}
                  >
                    {getContractStatusLabel(signingDialogContract.status)}
                  </span>
                </div>
              </div>

              {signingDialogContract.sign_token ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Enlace de firma del contrato
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={signingLinkForContract(signingDialogContract)}
                      className="flex-1 h-9 px-3 rounded-md border border-border/50 bg-input/30 text-xs focus:outline-none"
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          signingLinkForContract(signingDialogContract),
                          setCopiedSigningLink
                        )
                      }
                      className="h-9 px-3 bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25"
                    >
                      {copiedSigningLink ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  {copiedSigningLink && (
                    <p className="text-xs text-primary/70">¡Enlace copiado!</p>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
                  Este contrato aún no tiene token de firma generado. Puede haberse creado antes
                  del sistema de firma.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 bg-muted/30 px-4 pb-4 pt-3 rounded-b-xl border-t border-border/30">
            <Button
              variant="outline"
              onClick={() => setSigningDialogContract(null)}
              className="w-full border-border/50"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
