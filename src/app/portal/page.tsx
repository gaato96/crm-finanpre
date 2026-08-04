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
import { FormattedAmount } from '@/components/ui/formatted-amount'
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
  adjustToNextBusinessDay,
  numberToWords,
  fillContractTemplate
} from '@/lib/helpers'
import {
  TrendingUp,
  Wallet,
  Clock,
  ArrowUpRight,
  HelpCircle,
  ArrowDownLeft,
  Loader2,
  Download,
  AlertTriangle,
  Flame,
  Info,
  Car,
  Building2,
  Sparkles,
  CheckCircle,
  FileText,
  DollarSign,
  Lock,
  Coins,
  ChevronRight,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { calculateVehicleValuation, calculateRealEstateValuation, type ValuationConfig } from '@/lib/valuation'
import { requestWithdrawal, createSelfServiceInvestment } from './actions'

export default function PortalHomePage() {
  const { user, profile } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])

  // Simulator dialog state
  const [showSimulatorDialog, setShowSimulatorDialog] = useState(false)
  const [valConfig, setValConfig] = useState<ValuationConfig | null>(null)
  const [simulatorLoading, setSimulatorLoading] = useState(false)
  const [simulatorSuccess, setSimulatorSuccess] = useState(false)
  const [simulatorError, setSimulatorError] = useState<string | null>(null)

  // Dolar Blue state
  const [dolarBlue, setDolarBlue] = useState<number | null>(null)

  // Form states
  const [valType, setValType] = useState<'vehiculo' | 'inmueble'>('vehiculo')
  const [valDescription, setValDescription] = useState('')
  const [valMarketValue, setValMarketValue] = useState('')

  // Vehicle
  const [vehBrandModel, setVehBrandModel] = useState('')
  const [vehYear, setVehYear] = useState<number>(new Date().getFullYear())
  const [vehMileage, setVehMileage] = useState<number>(0)
  const [vehCrashes, setVehCrashes] = useState<'none' | 'minor' | 'major'>('none')
  const [vehEngine, setVehEngine] = useState<'good' | 'fair' | 'poor'>('good')
  const [vehBattery, setVehBattery] = useState<'good' | 'bad'>('good')

  // Property
  const [propType, setPropType] = useState<'casa' | 'departamento' | 'terreno'>('casa')
  const [propZone, setPropZone] = useState('')
  const [propArea, setPropArea] = useState<number>(0)
  const [propRooms, setPropRooms] = useState<number>(1)
  const [propBedrooms, setPropBedrooms] = useState<number>(0)
  const [propBathrooms, setPropBathrooms] = useState<number>(1)
  const [propPatio, setPropPatio] = useState(false)
  const [propGarage, setPropGarage] = useState(false)
  const [propConstructionYears, setPropConstructionYears] = useState<number>(0)
  const [propHasPlans, setPropHasPlans] = useState(true)
  const [propTaxesUpToDate, setPropTaxesUpToDate] = useState(true)
  const [propMortgageEligible, setPropMortgageEligible] = useState(true)

  const [valResult, setValResult] = useState<{ score: number, label: string, reasons: string[] } | null>(null)

  // New investment states
  const [activeTab, setActiveTab] = useState('activas')
  const [newInvCurrency, setNewInvCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [newInvCapital, setNewInvCapital] = useState<number>(1000000)
  const [newInvStartDate, setNewInvStartDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [newInvStep, setNewInvStep] = useState<number>(1) // 1: Simular, 2: Datos, 3: Preview
  const [activeTemplate, setActiveTemplate] = useState<any>(null)
  const [generatingContract, setGeneratingContract] = useState(false)
  const [monthlyYieldConfig, setMonthlyYieldConfig] = useState({ ars_monthly_rate: 8.5, usd_monthly_rate: 5.0 })
  const [adminWhatsappPhone, setAdminWhatsappPhone] = useState('5493815000000')

  // Read initial params from URL if present to auto-navigate to "nueva" tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qCurr = params.get('currency')
    const qCap = params.get('capital')
    if (qCurr && qCap) {
      setActiveTab('nueva')
      if (qCurr === 'ARS' || qCurr === 'USD') setNewInvCurrency(qCurr)
      setNewInvCapital(parseFloat(qCap) || 1000000)
    }
  }, [])

  // Dynamic valuation calculation
  useEffect(() => {
    if (!valConfig) return

    if (valType === 'vehiculo') {
      const result = calculateVehicleValuation({
        brandModel: vehBrandModel,
        year: Number(vehYear) || new Date().getFullYear(),
        mileage: Number(vehMileage) || 0,
        crashes: vehCrashes,
        engineCondition: vehEngine,
        batteryCondition: vehBattery,
      }, valConfig)

      setValMarketValue(result.estimatedValue.toString())
      setValResult({ score: result.saleabilityScore, label: result.saleabilityLabel, reasons: result.saleabilityReasons })
      
      const detailsText = `${vehBrandModel} ${vehYear} (${vehMileage.toLocaleString()} km) · Choques: ${vehCrashes === 'none' ? 'Ninguno' : vehCrashes === 'minor' ? 'Leves' : 'Graves'} · Motor: ${vehEngine === 'good' ? 'Excelente' : vehEngine === 'fair' ? 'Regular' : 'Malo'}`
      setValDescription(detailsText)
    } else {
      const result = calculateRealEstateValuation({
        propertyType: propType,
        zone: propZone || 'Otras zonas',
        areaSqm: Number(propArea) || 0,
        rooms: Number(propRooms) || 1,
        bedrooms: Number(propBedrooms) || 0,
        bathrooms: Number(propBathrooms) || 1,
        hasPatio: propPatio,
        hasGarage: propGarage,
        constructionYears: Number(propConstructionYears) || 0,
        hasPlans: propHasPlans,
        taxesUpToDate: propTaxesUpToDate,
        mortgageEligible: propMortgageEligible,
      }, valConfig)

      setValMarketValue(result.estimatedValue.toString())
      setValResult({ score: result.saleabilityScore, label: result.saleabilityLabel, reasons: result.saleabilityReasons })

      const detailsText = `${propType.toUpperCase()} en ${propZone || 'Tucumán'} · ${propArea} m² · ${propRooms} amb (${propBedrooms} dorm, ${propBathrooms} baños) ${propGarage ? '· Cochera' : ''} ${propPatio ? '· Patio' : ''} · Antigüedad: ${propConstructionYears} años`
      setValDescription(detailsText)
    }
  }, [
    valType, vehBrandModel, vehYear, vehMileage, vehCrashes, vehEngine, vehBattery,
    propType, propZone, propArea, propRooms, propBedrooms, propBathrooms, propPatio, propGarage,
    propConstructionYears, propHasPlans, propTaxesUpToDate, propMortgageEligible,
    valConfig
  ])

  // Ticker state — un único objeto para provocar un solo re-render por tick
  const [ticker, setTicker] = useState({
    ars: { total: 0, initial: 0, gains: 0, eps: 0 },
    usd: { total: 0, initial: 0, gains: 0, eps: 0 },
  })
  const tickerARS = ticker.ars
  const tickerUSD = ticker.usd

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

  const fetchAnnouncements = useCallback(async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    setAnnouncements(data || [])
  }, [supabase])

  const fetchSettingsAndTemplates = useCallback(async () => {
    const [valRes, yieldRes, whatsappRes, templateRes] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'valuation_config').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'monthly_yield_config').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'admin_whatsapp').maybeSingle(),
      supabase.from('contract_templates').select('*').eq('type', 'inversion').eq('is_active', true).order('version', { ascending: false }).limit(1).maybeSingle()
    ])

    if (valRes.data && valRes.data.value) {
      setValConfig(valRes.data.value as ValuationConfig)
      const zones = Object.keys((valRes.data.value as ValuationConfig).realEstate.zones)
      if (zones.length > 0) {
        setPropZone(zones[0])
      }
    }
    if (yieldRes.data && yieldRes.data.value) {
      setMonthlyYieldConfig(yieldRes.data.value as any)
    }
    if (whatsappRes.data && whatsappRes.data.value) {
      setAdminWhatsappPhone((whatsappRes.data.value as any).phone || '5493815000000')
    }
    if (templateRes.data) {
      setActiveTemplate(templateRes.data)
    }
  }, [supabase])

  useEffect(() => {
    fetchContracts()
    fetchAnnouncements()
    fetchSettingsAndTemplates()
  }, [fetchContracts, fetchAnnouncements, fetchSettingsAndTemplates])

  // Fetch Dolar Blue on mount
  useEffect(() => {
    fetch('https://dolarapi.com/v1/dolares')
      .then((r) => r.json())
      .then((arr: any[]) => {
        const blue = arr.find((d) => d.casa === 'blue')
        if (blue) setDolarBlue(blue.venta)
      })
      .catch(() => {})
  }, [])

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

    setTicker({
      ars: { total: arsTotal, initial: arsInitial, gains: arsGains, eps: arsEps },
      usd: { total: usdTotal, initial: usdInitial, gains: usdGains, eps: usdEps },
    })
  }, [contracts])

  useEffect(() => {
    // Solo corre si hay capital generando interés; se detiene con la pestaña oculta
    // para no consumir batería del teléfono en segundo plano.
    const hasLiveContracts = contracts.some(
      (c) => c.status === 'activo' || c.status === 'retiro_solicitado'
    )
    if (!hasLiveContracts) return

    let interval: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (interval !== null) return
      updateRealtimeBalances()
      interval = setInterval(updateRealtimeBalances, 200)
    }
    const stop = () => {
      if (interval !== null) {
        clearInterval(interval)
        interval = null
      }
    }
    const onVisibilityChange = () => (document.hidden ? stop() : start())

    start()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [contracts, updateRealtimeBalances])

  // Request withdrawal handler — validado en el servidor (titularidad, estado y bloqueo)
  const handleRequestWithdrawal = async (contractId: string) => {
    if (!confirm('¿Estás seguro de solicitar el retiro de esta inversión? Se suspenderá la generación de nuevos intereses una vez confirmado por el administrador.')) return
    setSubmitting(contractId)

    const result = await requestWithdrawal(contractId)

    if (result.error) {
      alert('Error al procesar solicitud: ' + result.error)
    } else {
      await fetchContracts()
    }
    setSubmitting(null)
  }

  const handleCreateContractSelfService = async () => {
    if (!user) return
    setGeneratingContract(true)

    const result = await createSelfServiceInvestment({
      currency: newInvCurrency,
      capital: newInvCapital,
      startDate: newInvStartDate,
    })

    if (result.error || !result.signToken) {
      alert('Error al generar el contrato: ' + (result.error || 'no se pudo generar el enlace de firma'))
      setGeneratingContract(false)
      return
    }

    // Open signing URL in new window
    window.open(`/firmar/${result.signToken}`, '_blank')

    alert('¡Inversión creada con éxito! Se abrirá el contrato en una nueva pestaña para que lo firmes y confirmes la transferencia.')
    await fetchContracts()
    setActiveTab('activas')
    setNewInvStep(1)
    setGeneratingContract(false)
  }

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSimulatorLoading(true)
    setSimulatorError(null)
    setSimulatorSuccess(false)

    const details = valType === 'vehiculo' ? {
      brandModel: vehBrandModel,
      year: vehYear,
      mileage: vehMileage,
      crashes: vehCrashes,
      engineCondition: vehEngine,
      batteryCondition: vehBattery
    } : {
      propertyType: propType,
      zone: propZone,
      areaSqm: propArea,
      rooms: propRooms,
      bedrooms: propBedrooms,
      bathrooms: propBathrooms,
      hasPatio: propPatio,
      hasGarage: propGarage
    }

    const { error: saveError } = await supabase
      .from('assets_valuation')
      .insert({
        client_id: user.id,
        asset_type: valType,
        description: valDescription,
        market_value: parseFloat(valMarketValue) || 0,
        currency: 'USD',
        status: 'pendiente',
        valuation_details: details,
        metadata: valResult,
      })

    if (saveError) {
      setSimulatorError(saveError.message)
      setSimulatorLoading(false)
      return
    }

    // Format WhatsApp message
    const formattedValue = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(parseFloat(valMarketValue))
    const clientName = profile?.full_name || user.email || 'Inversor'
    const clientPhone = profile?.phone || 'No especificado'
    const typeLabel = valType === 'vehiculo' ? '🚗 Vehículo' : '🏢 Inmueble'

    const msg = `Hola! Acabo de realizar una tasación de garantía desde el portal RENDIMAX.\n\n` +
      `*Cliente:* ${clientName}\n` +
      `*Teléfono:* ${clientPhone}\n` +
      `*Tipo de Activo:* ${typeLabel}\n` +
      `*Detalles:* ${valDescription}\n` +
      `*Valor Estimado:* ${formattedValue}\n\n` +
      `Confirmo que deseo registrar esta tasación como garantía para una inversión. Quedo a la espera de la cotización final y los días de consignación.`;

    const waUrl = `https://wa.me/${adminWhatsappPhone}?text=${encodeURIComponent(msg)}`
    window.open(waUrl, '_blank')

    setSimulatorSuccess(true)
    setSimulatorLoading(false)
    setTimeout(() => {
      setShowSimulatorDialog(false)
      setSimulatorSuccess(false)
      setVehBrandModel('')
      setVehMileage(0)
      setPropArea(0)
      setPropRooms(1)
      setPropBedrooms(0)
      setPropBathrooms(1)
      setPropPatio(false)
      setPropGarage(false)
      setPropConstructionYears(0)
      setPropHasPlans(true)
      setPropTaxesUpToDate(true)
      setPropMortgageEligible(true)
      setValResult(null)
    }, 2000)
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

      {/* Announcements / Alerts */}
      {announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map((ann) => {
            const colors = {
              info: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
              promo: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
              warning: 'bg-orange-500/10 border-orange-500/20 text-orange-300',
            }
            const icon = {
              info: <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />,
              promo: <Flame className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-pulse" />,
              warning: <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />,
            }

            return (
              <Card key={ann.id} className={cn("glass-card border border-border/50", colors[ann.type as 'info' | 'promo' | 'warning'] || colors.info)}>
                <CardContent className="p-4 flex gap-3 items-start">
                  {icon[ann.type as 'info' | 'promo' | 'warning'] || icon.info}
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm leading-snug">{ann.title}</h3>
                    <p className="text-xs opacity-90 leading-relaxed whitespace-pre-line">{ann.content}</p>
                    <span className="text-[9px] opacity-60 block pt-1">Publicado el {formatDate(ann.created_at)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Simulator Action Card */}
      <Card className="glass-card border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-transparent relative overflow-hidden">
        <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="font-bold text-sm text-foreground flex items-center justify-center sm:justify-start gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
              ¿Querés invertir con un auto o inmueble?
            </h3>
            <p className="text-xs text-muted-foreground">
              Simulá el valor estimado de tu activo en Tucumán y proponelo como garantía para tu contrato.
            </p>
          </div>
          <Button
            onClick={() => setShowSimulatorDialog(true)}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold shrink-0 text-xs h-9 px-4 rounded-lg"
          >
            Simular Tasación
          </Button>
        </CardContent>
      </Card>

      {/* Main Ticker Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ARS Portfolio */}
        {(tickerARS.total > 0 || contracts.some(c => c.currency === 'ARS')) && (
          <Card className="glass-card overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-4 sm:p-5 relative space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Portafolio en Pesos (ARS)
                </span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-[10px] uppercase font-bold">
                  ARS Ticker
                </Badge>
              </div>

              <div>
                <div className="flex items-baseline overflow-x-auto scrollbar-none py-1">
                  <FormattedAmount
                    amount={tickerARS.total}
                    currency="ARS"
                    precise
                    size="2xl"
                    className="ticker-glow"
                    color="text-primary"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap mt-1 text-xs">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-semibold">
                    +<FormattedAmount amount={tickerARS.gains} currency="ARS" size="sm" />
                  </span>
                  <span className="text-muted-foreground text-[10px]">acumulado</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                  <span>Creciendo a</span>
                  <span className="font-mono text-emerald-400">
                    +<FormattedAmount amount={tickerARS.eps} currency="ARS" precise size="sm" />/seg
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* USD Portfolio */}
        {(tickerUSD.total > 0 || contracts.some(c => c.currency === 'USD')) && (
          <Card className="glass-card overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />
            <CardContent className="p-4 sm:p-5 relative space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Portafolio en Dólares (USD)
                </span>
                <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px] uppercase font-bold">
                  USD Ticker
                </Badge>
              </div>

              <div>
                <div className="flex items-baseline overflow-x-auto scrollbar-none py-1">
                  <FormattedAmount
                    amount={tickerUSD.total}
                    currency="USD"
                    precise
                    size="2xl"
                    className="ticker-glow"
                    color="text-blue-400"
                  />
                </div>
                <div className="flex items-center gap-1 flex-wrap mt-1 text-xs">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-emerald-400 font-semibold">
                    +<FormattedAmount amount={tickerUSD.gains} currency="USD" size="sm" />
                  </span>
                  <span className="text-muted-foreground text-[10px]">acumulado</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-xs">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                  <span>Creciendo a</span>
                  <span className="font-mono text-blue-400">
                    +<FormattedAmount amount={tickerUSD.eps} currency="USD" precise size="sm" />/seg
                  </span>
                </p>
              </div>
              {dolarBlue !== null && tickerUSD.total > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border/20">
                  <span className="text-[10px] text-blue-400/70 font-medium uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="w-3 h-3" /> Blue • Venta ${dolarBlue.toLocaleString('es-AR')}
                  </span>
                  <span className="text-xs font-semibold text-blue-300">
                    ≈ {formatCurrency(tickerUSD.total * dolarBlue, 'ARS')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs Layout */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-accent/40 w-full grid grid-cols-3 p-1 max-w-lg">
          <TabsTrigger value="activas" className="text-xs sm:text-sm">Mis Inversiones ({activeContracts.length})</TabsTrigger>
          <TabsTrigger value="nueva" className="text-xs sm:text-sm">Nueva Inversión</TabsTrigger>
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
                  <CardContent className="p-4 sm:p-5 space-y-4">
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
                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-[10px] text-muted-foreground block uppercase tracking-wider">
                          {isRetiro ? 'Capital a Retirar' : 'Capital en Crecimiento'}
                        </span>
                        <div className="mt-0.5">
                          <FormattedAmount
                            amount={currentCap}
                            currency={contract.currency}
                            size="xl"
                            color={isRetiro ? 'text-orange-400' : 'text-emerald-400'}
                          />
                        </div>
                        {accrued > 0 && (
                          <span className="text-[11px] text-emerald-400/80 block mt-0.5 font-medium">
                            +<FormattedAmount amount={accrued} currency={contract.currency} size="sm" /> ganados
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress slider (only if active) */}
                    {(contract.status === 'activo' || isRetiro) && (() => {
                      const start = new Date(contract.start_date)
                      const end = new Date(contract.end_date)
                      const diffTime = Math.abs(end.getTime() - start.getTime())
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                      return (
                        <div className="space-y-1.5 pt-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Progreso del período ({diffDays} días)</span>
                            <span>{daysRemaining(contract)} días restantes</span>
                          </div>
                          <Progress value={contractProgress(contract)} className="h-2" />
                        </div>
                      )
                    })()}

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

                    {/* Bottom Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border/20 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Capital Inicial</span>
                        <div className="mt-0.5">
                          <FormattedAmount amount={Number(contract.initial_capital)} currency={contract.currency} size="sm" color="text-foreground" />
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground block text-[10px] uppercase tracking-wider">Tasa Mensual</span>
                        <span className="text-primary font-bold text-sm block mt-0.5">{contract.monthly_rate}%</span>
                      </div>
                    </div>

                    {/* Withdrawal Button (Full Width) */}
                    {contract.status === 'activo' && (() => {
                      const days = daysRemaining(contract)
                      const isBlocked = days <= 12
                      return isBlocked ? (
                        <div className="w-full mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
                          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-semibold text-amber-300">
                              Retiro bloqueado – {days} días al vencimiento
                            </p>
                            <p className="text-[10px] text-amber-400/70 mt-0.5">
                              No se puede solicitar el retiro cuando faltan 12 días o menos para el vencimiento.
                              Al vencer, el capital se reinvertirá automáticamente con interés compuesto.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleRequestWithdrawal(contract.id)}
                          disabled={submitting === contract.id}
                          className="w-full bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold gap-2 text-xs h-9 rounded-lg mt-2 transition-all duration-200"
                        >
                          {submitting === contract.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5 text-slate-950" />
                          )}
                          Solicitar Retiro
                        </Button>
                      )
                    })()}
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
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <h4 className="font-bold text-sm text-foreground">
                              Inversión en {contract.currency} ·
                            </h4>
                            <FormattedAmount amount={Number(contract.initial_capital)} currency={contract.currency} size="sm" color="text-foreground" />
                            <Badge variant="outline" className={`text-[10px] ml-1.5 ${getContractStatusColor(contract.status)}`}>
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

        {/* Tab: Nueva Inversión */}
        <TabsContent value="nueva" className="space-y-6 mt-4">
          <Card className="glass-card">
            <CardHeader className="border-b border-border/20 bg-accent/5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Coins className="w-5 h-5 text-emerald-400" />
                Nueva Inversión Autogestionada
              </CardTitle>
              <CardDescription>
                Simulá, generá tu contrato y realizá tu inversión 100% online
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              
              {/* Step indicator */}
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 border-b border-border/10 pb-4 mb-4">
                <span className={newInvStep === 1 ? "text-emerald-400 font-bold animate-pulse" : ""}>1. Simular</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className={newInvStep === 2 ? "text-emerald-400 font-bold" : ""}>2. Completar Datos</span>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className={newInvStep === 3 ? "text-emerald-400 font-bold" : ""}>3. Previsualizar Contrato</span>
              </div>

              {/* STEP 1: Simular */}
              {newInvStep === 1 && (() => {
                const newInvRate = newInvCurrency === 'ARS' ? monthlyYieldConfig.ars_monthly_rate : monthlyYieldConfig.usd_monthly_rate
                const newInvProjections = [
                  { months: 1, label: '1 Mes', colorClass: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/15' },
                  { months: 3, label: '3 Meses', colorClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15' },
                  { months: 6, label: '6 Meses', colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15' },
                  { months: 12, label: '12 Meses', colorClass: 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/15' },
                ].map(p => {
                  const finalCapital = newInvCapital * Math.pow(1 + newInvRate / 100, p.months)
                  const gains = finalCapital - newInvCapital
                  return { ...p, finalCapital, gains }
                })

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Moneda de la Inversión</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewInvCurrency('ARS')}
                            className={`py-2.5 px-4 rounded-xl border text-sm font-semibold transition-all ${
                              newInvCurrency === 'ARS'
                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                                : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            Pesos ($ ARS)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewInvCurrency('USD')}
                            className={`py-2.5 px-4 rounded-xl border text-sm font-semibold transition-all ${
                              newInvCurrency === 'USD'
                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                                : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'
                            }`}
                          >
                            Dólares (US$ USD)
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="newInvCapital">Capital Inicial a Invertir</Label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
                            {newInvCurrency === 'ARS' ? '$' : 'US$'}
                          </span>
                          <Input
                            id="newInvCapital"
                            type="number"
                            value={newInvCapital}
                            onChange={(e) => setNewInvCapital(Math.max(0, parseInt(e.target.value) || 0))}
                            className="pl-10 bg-white/5 border-white/10 font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex justify-between text-xs items-center">
                      <span className="text-slate-400">Rendimiento Mensual de la Inversión:</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        {newInvRate}%
                      </span>
                    </div>

                    {/* Projections layout */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyección de Capital Proyectado</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {newInvProjections.map((p) => (
                          <div
                            key={p.months}
                            className={`p-4 rounded-xl border flex flex-col justify-between h-[110px] ${p.colorClass}`}
                          >
                            <span className="text-[9px] uppercase font-bold tracking-wider opacity-85">{p.label}</span>
                            <div>
                              <div className="text-sm font-extrabold font-mono leading-none">
                                {formatCurrency(p.finalCapital, newInvCurrency)}
                              </div>
                              <div className="text-[10px] opacity-75 mt-1 font-mono text-right">
                                +{formatCurrency(p.gains, newInvCurrency)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={() => setNewInvStep(2)}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold py-5 rounded-xl flex items-center justify-center gap-2"
                    >
                      Continuar a Datos de Inversión <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )
              })()}

              {/* STEP 2: Completar Datos */}
              {newInvStep === 2 && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Moneda Seleccionada</Label>
                      <Input
                        value={newInvCurrency === 'ARS' ? 'Pesos ($ ARS)' : 'Dólares (US$ USD)'}
                        disabled
                        className="bg-white/5 border-white/10 text-slate-400 font-medium"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Capital Inicial</Label>
                      <Input
                        value={formatCurrency(newInvCapital, newInvCurrency)}
                        disabled
                        className="bg-white/5 border-white/10 text-slate-400 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="newInvStartDate">Fecha de Inicio de Inversión</Label>
                      <Input
                        id="newInvStartDate"
                        type="date"
                        value={newInvStartDate}
                        onChange={(e) => setNewInvStartDate(e.target.value)}
                        className="bg-white/5 border-white/10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Primer Vencimiento (30 días corridos, ajustado a día hábil)</Label>
                      <Input
                        value={(() => {
                          const start = new Date(newInvStartDate + 'T12:00:00')
                          const end = new Date(start)
                          end.setDate(end.getDate() + 30)
                          const adjusted = adjustToNextBusinessDay(end.toISOString().split('T')[0])
                          return formatDate(adjusted)
                        })()}
                        disabled
                        className="bg-white/5 border-white/10 text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tasa Mensual Fija Aplicable:</span>
                      <span className="text-emerald-400 font-bold">
                        {newInvCurrency === 'ARS' ? monthlyYieldConfig.ars_monthly_rate : monthlyYieldConfig.usd_monthly_rate}%
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setNewInvStep(1)}
                      className="flex-1 border-white/10 text-slate-300 h-11"
                    >
                      Atrás
                    </Button>
                    <Button
                      onClick={() => setNewInvStep(3)}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold h-11"
                    >
                      Previsualizar Contrato
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP 3: Preview Contract */}
              {newInvStep === 3 && (
                <div className="space-y-6">
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 max-h-[350px] overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300">
                    {activeTemplate ? (
                      <div 
                        dangerouslySetInnerHTML={{
                          __html: fillContractTemplate(
                            activeTemplate.content,
                            {
                              fecha_contrato: formatDate(new Date().toISOString()),
                              nombre_cliente: profile?.full_name || 'PENDIENTE DE REGISTRO',
                              dni_cliente: profile?.cuit || 'PENDIENTE DE REGISTRO',
                              domicilio_cliente: profile?.address || 'PENDIENTE DE REGISTRO',
                              moneda: newInvCurrency === 'ARS' ? 'PESOS' : 'DÓLARES',
                              monto_inicial: newInvCapital.toString(),
                              monto_letras: numberToWords(newInvCapital).toUpperCase() + ' ' + (newInvCurrency === 'ARS' ? 'PESOS' : 'DÓLARES'),
                              tasa_mensual: (newInvCurrency === 'ARS' ? monthlyYieldConfig.ars_monthly_rate : monthlyYieldConfig.usd_monthly_rate).toString(),
                              fecha_inicio: formatDate(newInvStartDate),
                              fecha_firma: formatDate(new Date().toISOString()),
                              hora_firma: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
                              ip_firma: 'PREVIEW'
                            },
                            activeTemplate.name
                          )
                        }}
                      />
                    ) : (
                      <p className="text-center text-slate-500 py-10">Cargando plantilla de contrato...</p>
                    )}
                  </div>

                  <div className="p-3 text-xs rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                    * Al confirmar la inversión, el contrato será generado automáticamente y se abrirá una nueva pestaña para firmar electrónicamente el contrato en el canvas de firmas de RENDIMAX. Una vez firmado, recibirás la información para transferir.
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setNewInvStep(2)}
                      disabled={generatingContract}
                      className="flex-1 border-white/10 text-slate-300 h-11"
                    >
                      Atrás
                    </Button>
                    <Button
                      onClick={handleCreateContractSelfService}
                      disabled={generatingContract || !activeTemplate}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold h-11 flex items-center justify-center gap-2"
                    >
                      {generatingContract ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          Confirmar e Ir a Firmar <FileText className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Simulator Dialog */}
      <Dialog open={showSimulatorDialog} onOpenChange={setShowSimulatorDialog}>
        <DialogContent className="glass-card border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              Simulador de Tasación y Garantía
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmitProposal} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Tipo de Activo</Label>
              <select
                value={valType}
                onChange={(e) => setValType(e.target.value as any)}
                className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
              >
                <option value="vehiculo">🚗 Vehículo</option>
                <option value="inmueble">🏢 Inmueble</option>
              </select>
            </div>

            {valType === 'vehiculo' ? (
              // VEHICLE FORM
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Marca y Modelo</Label>
                  <Input
                    required
                    placeholder="Toyota Corolla XEI 2020"
                    value={vehBrandModel}
                    onChange={(e) => setVehBrandModel(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Año de Fabricación</Label>
                    <Input
                      type="number"
                      required
                      min={1950}
                      max={new Date().getFullYear()}
                      value={vehYear}
                      onChange={(e) => setVehYear(parseInt(e.target.value) || new Date().getFullYear())}
                      className="bg-input/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kilometraje</Label>
                    <Input
                      type="number"
                      required
                      min={0}
                      value={vehMileage}
                      onChange={(e) => setVehMileage(parseInt(e.target.value) || 0)}
                      className="bg-input/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Choques</Label>
                    <select
                      value={vehCrashes}
                      onChange={(e) => setVehCrashes(e.target.value as any)}
                      className="w-full h-10 px-2 rounded-md border border-border bg-input/50 text-xs focus:outline-none"
                    >
                      <option value="none">Ninguno</option>
                      <option value="minor">Leve</option>
                      <option value="major">Grave</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Motor</Label>
                    <select
                      value={vehEngine}
                      onChange={(e) => setVehEngine(e.target.value as any)}
                      className="w-full h-10 px-2 rounded-md border border-border bg-input/50 text-xs focus:outline-none"
                    >
                      <option value="good">Excelente</option>
                      <option value="fair">Regular</option>
                      <option value="poor">Falla</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Batería</Label>
                    <select
                      value={vehBattery}
                      onChange={(e) => setVehBattery(e.target.value as any)}
                      className="w-full h-10 px-2 rounded-md border border-border bg-input/50 text-xs focus:outline-none"
                    >
                      <option value="good">Operativa</option>
                      <option value="bad">Falla</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              // REAL ESTATE FORM
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Tipo de Propiedad</Label>
                    <select
                      value={propType}
                      onChange={(e) => setPropType(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                    >
                      <option value="casa">Casa</option>
                      <option value="departamento">Departamento</option>
                      <option value="terreno">Terreno</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Zona en Tucumán</Label>
                    <select
                      value={propZone}
                      onChange={(e) => setPropZone(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                    >
                      {valConfig && Object.keys(valConfig.realEstate.zones).map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Superficie ($m^2$)</Label>
                    <Input
                      type="number"
                      required
                      min={1}
                      value={propArea}
                      onChange={(e) => setPropArea(parseInt(e.target.value) || 0)}
                      className="bg-input/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Ambientes totales</Label>
                    <Input
                      type="number"
                      required
                      min={1}
                      value={propRooms}
                      onChange={(e) => setPropRooms(parseInt(e.target.value) || 1)}
                      className="bg-input/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Dormitorios</Label>
                    <Input
                      type="number"
                      required
                      min={0}
                      value={propBedrooms}
                      onChange={(e) => setPropBedrooms(parseInt(e.target.value) || 0)}
                      className="bg-input/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Baños</Label>
                    <Input
                      type="number"
                      required
                      min={1}
                      value={propBathrooms}
                      onChange={(e) => setPropBathrooms(parseInt(e.target.value) || 1)}
                      className="bg-input/50"
                    />
                  </div>
                </div>

                <div className="flex gap-4 p-1">
                  <div className="flex items-center gap-2">
                    <input
                      id="propPatio"
                      type="checkbox"
                      checked={propPatio}
                      onChange={(e) => setPropPatio(e.target.checked)}
                      className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
                    />
                    <Label htmlFor="propPatio" className="text-xs font-medium cursor-pointer">¿Tiene Patio?</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="propGarage"
                      type="checkbox"
                      checked={propGarage}
                      onChange={(e) => setPropGarage(e.target.checked)}
                      className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
                    />
                    <Label htmlFor="propGarage" className="text-xs font-medium cursor-pointer">¿Tiene Cochera?</Label>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-border/50">
                  <Label>Años de Construcción (Antigüedad)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={propConstructionYears}
                    onChange={(e) => setPropConstructionYears(parseInt(e.target.value) || 0)}
                    className="bg-input/50"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 p-1">
                  <div className="flex items-center gap-2">
                    <input
                      id="propHasPlans"
                      type="checkbox"
                      checked={propHasPlans}
                      onChange={(e) => setPropHasPlans(e.target.checked)}
                      className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
                    />
                    <Label htmlFor="propHasPlans" className="text-xs font-medium cursor-pointer">Planos de mensura hechos y no vencidos</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="propTaxesUpToDate"
                      type="checkbox"
                      checked={propTaxesUpToDate}
                      onChange={(e) => setPropTaxesUpToDate(e.target.checked)}
                      className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
                    />
                    <Label htmlFor="propTaxesUpToDate" className="text-xs font-medium cursor-pointer">Impuestos (Rentas, Municipal) al día</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="propMortgageEligible"
                      type="checkbox"
                      checked={propMortgageEligible}
                      onChange={(e) => setPropMortgageEligible(e.target.checked)}
                      className="w-4 h-4 text-emerald-500 rounded focus:ring-emerald-500"
                    />
                    <Label htmlFor="propMortgageEligible" className="text-xs font-medium cursor-pointer">Apto para crédito hipotecario</Label>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1 text-center">
              <span className="text-xs text-muted-foreground block font-semibold">Valor Estimado de Inversión:</span>
              <div className="block pt-0.5">
                <FormattedAmount
                  amount={parseFloat(valMarketValue) || 0}
                  currency="USD"
                  size="2xl"
                  color="text-emerald-400"
                />
              </div>
              
              {valResult && (
                <div className="pt-2 mt-2 border-t border-emerald-500/10">
                  <div className="flex justify-between items-center mb-1 text-left">
                    <span className="text-xs text-muted-foreground font-semibold">Facilidad de Venta:</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      valResult.label === 'Alta' ? 'bg-emerald-500/20 text-emerald-400' :
                      valResult.label === 'Media' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {valResult.label} ({valResult.score}/100)
                    </span>
                  </div>
                  <ul className="text-[10px] text-muted-foreground list-disc pl-4 space-y-0.5 mt-2 text-left">
                    {valResult.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              <span className="text-[10px] text-muted-foreground block italic pt-3">
                La cotización real final puede variar y está sujeta a revisión ocular por un gestor.
              </span>
            </div>

            {simulatorError && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {simulatorError}
              </div>
            )}

            {simulatorSuccess && (
              <div className="p-3 rounded bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>¡Propuesta de garantía enviada con éxito! Redirigiendo...</span>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSimulatorDialog(false)}
                className="flex-1 text-xs"
              >
                Cerrar
              </Button>
              <Button
                type="submit"
                disabled={simulatorLoading || simulatorSuccess}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold text-xs"
              >
                {simulatorLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Proponer Garantía'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
