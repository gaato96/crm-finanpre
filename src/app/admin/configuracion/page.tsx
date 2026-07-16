'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_VALUATION_CONFIG, type ValuationConfig } from '@/lib/valuation'
import {
  Settings,
  Save,
  Car,
  Building2,
  Loader2,
  DollarSign,
  AlertCircle,
  Plus,
  Trash2,
  Percent,
  Phone,
} from 'lucide-react'

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<ValuationConfig>(DEFAULT_VALUATION_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Custom zones additions
  const [newZoneName, setNewZoneName] = useState('')
  const [newZonePrice, setNewZonePrice] = useState('')

  // New configurations
  const [bcraYield, setBcraYield] = useState<number>(40)
  const [bankDetails, setBankDetails] = useState({
    banco: 'Banco Galicia',
    cbu: '0070089020000000001234',
    alias: 'RENDIMAX.INVERSION',
    titular: 'RENDIMAX S.A.',
    cuit: '30-71700000-0'
  })
  const [monthlyYield, setMonthlyYield] = useState({
    ars_monthly_rate: 8.5,
    usd_monthly_rate: 5.0
  })
  const [adminWhatsapp, setAdminWhatsapp] = useState('5493815000000')

  const supabase = createClient()

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true)
      const [valRes, bcraRes, bankRes, yieldRes, whatsappRes] = await Promise.all([
        supabase.from('system_settings').select('value').eq('key', 'valuation_config').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'bcra_yield_config').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'bank_transfer_details').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'monthly_yield_config').maybeSingle(),
        supabase.from('system_settings').select('value').eq('key', 'admin_whatsapp').maybeSingle(),
      ])

      if (valRes.data && valRes.data.value) {
        setConfig(valRes.data.value as ValuationConfig)
      }
      if (bcraRes.data && bcraRes.data.value) {
        setBcraYield((bcraRes.data.value as any).rendimiento_minimo_anual || 40)
      }
      if (bankRes.data && bankRes.data.value) {
        setBankDetails(bankRes.data.value as any)
      }
      if (yieldRes.data && yieldRes.data.value) {
        setMonthlyYield(yieldRes.data.value as any)
      }
      if (whatsappRes.data && whatsappRes.data.value) {
        setAdminWhatsapp((whatsappRes.data.value as any).phone || '5493815000000')
      }
      setLoading(false)
    }

    fetchConfig()
  }, [supabase])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)

    const [valErr, bcraErr, bankErr, yieldErr, whatsappErr] = await Promise.all([
      supabase.from('system_settings').upsert({
        key: 'valuation_config',
        value: config,
        updated_at: new Date().toISOString(),
      }),
      supabase.from('system_settings').upsert({
        key: 'bcra_yield_config',
        value: { rendimiento_minimo_anual: Number(bcraYield) || 40 },
        updated_at: new Date().toISOString(),
      }),
      supabase.from('system_settings').upsert({
        key: 'bank_transfer_details',
        value: bankDetails,
        updated_at: new Date().toISOString(),
      }),
      supabase.from('system_settings').upsert({
        key: 'monthly_yield_config',
        value: monthlyYield,
        updated_at: new Date().toISOString(),
      }),
      supabase.from('system_settings').upsert({
        key: 'admin_whatsapp',
        value: { phone: adminWhatsapp },
        updated_at: new Date().toISOString(),
      })
    ])

    if (valErr.error || bcraErr.error || bankErr.error || yieldErr.error || whatsappErr.error) {
      setStatus({ type: 'error', message: 'Error al guardar los ajustes.' })
    } else {
      setStatus({ type: 'success', message: 'Ajustes guardados correctamente.' })
      setTimeout(() => setStatus(null), 3000)
    }
    setSaving(false)
  }

  const updateVehConfig = (field: keyof ValuationConfig['vehicle'], val: any) => {
    setConfig((prev) => ({
      ...prev,
      vehicle: {
        ...prev.vehicle,
        [field]: val,
      },
    }))
  }

  const updateVehMileageMultiplier = (field: keyof ValuationConfig['vehicle']['mileageMultipliers'], val: number) => {
    setConfig((prev) => ({
      ...prev,
      vehicle: {
        ...prev.vehicle,
        mileageMultipliers: {
          ...prev.vehicle.mileageMultipliers,
          [field]: val,
        },
      },
    }))
  }

  const updateVehCrashDiscount = (field: keyof ValuationConfig['vehicle']['crashesDiscounts'], val: number) => {
    setConfig((prev) => ({
      ...prev,
      vehicle: {
        ...prev.vehicle,
        crashesDiscounts: {
          ...prev.vehicle.crashesDiscounts,
          [field]: val,
        },
      },
    }))
  }

  const updateVehEngineDiscount = (field: keyof ValuationConfig['vehicle']['engineDiscounts'], val: number) => {
    setConfig((prev) => ({
      ...prev,
      vehicle: {
        ...prev.vehicle,
        engineDiscounts: {
          ...prev.vehicle.engineDiscounts,
          [field]: val,
        },
      },
    }))
  }

  const updateREConfig = (field: keyof ValuationConfig['realEstate'], val: any) => {
    setConfig((prev) => ({
      ...prev,
      realEstate: {
        ...prev.realEstate,
        [field]: val,
      },
    }))
  }

  const updateREZonePrice = (zone: string, price: number) => {
    setConfig((prev) => ({
      ...prev,
      realEstate: {
        ...prev.realEstate,
        zones: {
          ...prev.realEstate.zones,
          [zone]: price,
        },
      },
    }))
  }

  const handleAddZone = () => {
    if (!newZoneName || !newZonePrice) return
    const priceVal = parseFloat(newZonePrice)
    if (isNaN(priceVal)) return

    setConfig((prev) => ({
      ...prev,
      realEstate: {
        ...prev.realEstate,
        zones: {
          ...prev.realEstate.zones,
          [newZoneName]: priceVal,
        },
      },
    }))
    setNewZoneName('')
    setNewZonePrice('')
  }

  const handleRemoveZone = (zone: string) => {
    setConfig((prev) => {
      const newZones = { ...prev.realEstate.zones }
      delete newZones[zone]
      return {
        ...prev,
        realEstate: {
          ...prev.realEstate,
          zones: newZones,
        },
      }
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-muted-foreground text-sm">Cargando configuración...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold gradient-text">Ajustes del Sistema</h1>
            <p className="text-muted-foreground text-sm">
              Configura los precios base y multiplicadores de cotización para vehículos e inmuebles
            </p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/25 transition-all"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Guardar Cambios
        </Button>
      </div>

      {status && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 ${
            status.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicles Configuration */}
        <Card className="glass-card">
          <CardHeader className="border-b border-border/20 bg-accent/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Car className="w-5 h-5 text-orange-400" />
              Parámetros de Vehículos (USD)
            </CardTitle>
            <CardDescription>
              Ajusta los valores base y descuentos para el cotizador automático de autos
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Base price & Battery */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="basePrice">Precio Base Promedio</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="basePrice"
                    type="number"
                    value={config.vehicle.basePrice}
                    onChange={(e) => updateVehConfig('basePrice', parseFloat(e.target.value) || 0)}
                    className="pl-9 bg-input/50"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="batteryDiscount">Dcto. Batería Deficiente</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="batteryDiscount"
                    type="number"
                    value={Math.abs(config.vehicle.batteryDiscount)}
                    onChange={(e) => updateVehConfig('batteryDiscount', -Math.abs(parseFloat(e.target.value) || 0))}
                    className="pl-9 bg-input/50 text-red-400"
                  />
                </div>
              </div>
            </div>

            {/* Mileage Multipliers */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Multiplicadores por Kilometraje</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="under50k">Menos de 50.000 km</Label>
                  <Input
                    id="under50k"
                    type="number"
                    step="0.05"
                    value={config.vehicle.mileageMultipliers.under50k}
                    onChange={(e) => updateVehMileageMultiplier('under50k', parseFloat(e.target.value) || 0)}
                    className="bg-input/50 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="under100k">50k a 100k km</Label>
                  <Input
                    id="under100k"
                    type="number"
                    step="0.05"
                    value={config.vehicle.mileageMultipliers.under100k}
                    onChange={(e) => updateVehMileageMultiplier('under100k', parseFloat(e.target.value) || 0)}
                    className="bg-input/50 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="under150k">100k a 150k km</Label>
                  <Input
                    id="under150k"
                    type="number"
                    step="0.05"
                    value={config.vehicle.mileageMultipliers.under150k}
                    onChange={(e) => updateVehMileageMultiplier('under150k', parseFloat(e.target.value) || 0)}
                    className="bg-input/50 font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="over150k">Más de 150.000 km</Label>
                  <Input
                    id="over150k"
                    type="number"
                    step="0.05"
                    value={config.vehicle.mileageMultipliers.over150k}
                    onChange={(e) => updateVehMileageMultiplier('over150k', parseFloat(e.target.value) || 0)}
                    className="bg-input/50 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Crash Discounts */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descuentos por Choques (USD)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="crashMinor">Choque Leve</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="crashMinor"
                      type="number"
                      value={Math.abs(config.vehicle.crashesDiscounts.minor)}
                      onChange={(e) => updateVehCrashDiscount('minor', -Math.abs(parseFloat(e.target.value) || 0))}
                      className="pl-9 bg-input/50 text-red-400 font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crashMajor">Choque Grave / Estructural</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="crashMajor"
                      type="number"
                      value={Math.abs(config.vehicle.crashesDiscounts.major)}
                      onChange={(e) => updateVehCrashDiscount('major', -Math.abs(parseFloat(e.target.value) || 0))}
                      className="pl-9 bg-input/50 text-red-400 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Engine Discounts */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descuentos por Estado del Motor (USD)</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="engineFair">Desgaste Medio / Ruidos</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="engineFair"
                      type="number"
                      value={Math.abs(config.vehicle.engineDiscounts.fair)}
                      onChange={(e) => updateVehEngineDiscount('fair', -Math.abs(parseFloat(e.target.value) || 0))}
                      className="pl-9 bg-input/50 text-red-400 font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enginePoor">Requiere Reparación / Falla</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="enginePoor"
                      type="number"
                      value={Math.abs(config.vehicle.engineDiscounts.poor)}
                      onChange={(e) => updateVehEngineDiscount('poor', -Math.abs(parseFloat(e.target.value) || 0))}
                      className="pl-9 bg-input/50 text-red-400 font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Real Estate Configuration */}
        <Card className="glass-card">
          <CardHeader className="border-b border-border/20 bg-accent/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Parámetros de Inmuebles (USD)
            </CardTitle>
            <CardDescription>
              Configura el valor de metros cuadrados por zona en Tucumán y valores añadidos
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Added values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bedroomVal">Valor por Dormitorio</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="bedroomVal"
                    type="number"
                    value={config.realEstate.bedroomValue}
                    onChange={(e) => updateREConfig('bedroomValue', parseFloat(e.target.value) || 0)}
                    className="pl-9 bg-input/50"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bathroomVal">Valor por Baño</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="bathroomVal"
                    type="number"
                    value={config.realEstate.bathroomValue}
                    onChange={(e) => updateREConfig('bathroomValue', parseFloat(e.target.value) || 0)}
                    className="pl-9 bg-input/50"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="garageVal">Valor por Cochera</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="garageVal"
                    type="number"
                    value={config.realEstate.garageValue}
                    onChange={(e) => updateREConfig('garageValue', parseFloat(e.target.value) || 0)}
                    className="pl-9 bg-input/50"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patioVal">Valor por Patio/Jardín</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    id="patioVal"
                    type="number"
                    value={config.realEstate.patioValue}
                    onChange={(e) => updateREConfig('patioValue', parseFloat(e.target.value) || 0)}
                    className="pl-9 bg-input/50"
                  />
                </div>
              </div>
            </div>

            {/* Zones config */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Valor de $m^2$ por Zona en Tucumán</h4>
              
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {Object.entries(config.realEstate.zones).map(([zone, price]) => (
                  <div key={zone} className="flex items-center gap-3 justify-between bg-accent/20 p-2.5 rounded-lg border border-border/30">
                    <span className="text-sm font-semibold truncate flex-1">{zone}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative w-28">
                        <DollarSign className="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                        <Input
                          type="number"
                          value={price}
                          onChange={(e) => updateREZonePrice(zone, parseFloat(e.target.value) || 0)}
                          className="h-8 pl-6 pr-1.5 py-0.5 text-xs bg-input/50 font-mono text-right"
                        />
                      </div>
                      {zone !== 'Otras zonas' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveZone(zone)}
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Zone form */}
              <div className="flex gap-2 pt-2">
                <Input
                  placeholder="Yerba Buena, Tafí Viejo..."
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  className="h-9 text-xs bg-input/50 flex-1"
                />
                <div className="relative w-24">
                  <DollarSign className="w-3 h-3 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="USD/m²"
                    type="number"
                    value={newZonePrice}
                    onChange={(e) => setNewZonePrice(e.target.value)}
                    className="h-9 pl-5 pr-2 py-1 text-xs bg-input/50 font-mono"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleAddZone}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold h-9 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Agregar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rendimientos Mensuales */}
      <Card className="glass-card">
        <CardHeader className="border-b border-border/20 bg-accent/10">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Percent className="w-5 h-5 text-emerald-400" />
            Rendimientos Mensuales
          </CardTitle>
          <CardDescription>
            Tasas mensuales que se aplican a nuevas inversiones en ARS y USD
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <Label htmlFor="arsRate">Tasa Mensual ARS (%)</Label>
              <div className="relative">
                <Percent className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="arsRate"
                  type="number"
                  step="0.1"
                  value={monthlyYield.ars_monthly_rate}
                  onChange={(e) => setMonthlyYield(p => ({ ...p, ars_monthly_rate: parseFloat(e.target.value) || 0 }))}
                  className="pl-9 bg-input/50"
                />
              </div>
              <p className="text-xs text-muted-foreground">Rendimiento mensual para inversiones en pesos argentinos</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usdRate">Tasa Mensual USD (%)</Label>
              <div className="relative">
                <Percent className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="usdRate"
                  type="number"
                  step="0.1"
                  value={monthlyYield.usd_monthly_rate}
                  onChange={(e) => setMonthlyYield(p => ({ ...p, usd_monthly_rate: parseFloat(e.target.value) || 0 }))}
                  className="pl-9 bg-input/50"
                />
              </div>
              <p className="text-xs text-muted-foreground">Rendimiento mensual para inversiones en dólares</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Admin + Datos Bancarios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader className="border-b border-border/20 bg-accent/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="w-5 h-5 text-emerald-400" />
              WhatsApp del Administrador
            </CardTitle>
            <CardDescription>
              Número al que se enviarán las notificaciones de tasaciones de clientes
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="adminPhone">Número completo (con código de país, sin +)</Label>
              <div className="relative">
                <Phone className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  id="adminPhone"
                  value={adminWhatsapp}
                  onChange={(e) => setAdminWhatsapp(e.target.value)}
                  className="pl-9 bg-input/50 font-mono"
                  placeholder="5493815000000"
                />
              </div>
              <p className="text-xs text-muted-foreground">Ej: 5493815000000 (54 = Argentina, 9 = celular, 381 = área Tucumán)</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="border-b border-border/20 bg-accent/10">
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="w-5 h-5 text-blue-400" />
              Datos Bancarios para Inversiones
            </CardTitle>
            <CardDescription>
              Información de transferencia que se muestra a los inversores al confirmar su inversión
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bankName">Nombre del Banco</Label>
                <Input
                  id="bankName"
                  value={bankDetails.banco}
                  onChange={(e) => setBankDetails(p => ({ ...p, banco: e.target.value }))}
                  className="bg-input/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankOwner">Titular de Cuenta</Label>
                <Input
                  id="bankOwner"
                  value={bankDetails.titular}
                  onChange={(e) => setBankDetails(p => ({ ...p, titular: e.target.value }))}
                  className="bg-input/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankCuit">CUIT del Titular</Label>
                <Input
                  id="bankCuit"
                  value={bankDetails.cuit}
                  onChange={(e) => setBankDetails(p => ({ ...p, cuit: e.target.value }))}
                  className="bg-input/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAlias">Alias de Cuenta</Label>
                <Input
                  id="bankAlias"
                  value={bankDetails.alias}
                  onChange={(e) => setBankDetails(p => ({ ...p, alias: e.target.value }))}
                  className="bg-input/50"
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="bankCbu">CBU / CVU</Label>
                <Input
                  id="bankCbu"
                  value={bankDetails.cbu}
                  onChange={(e) => setBankDetails(p => ({ ...p, cbu: e.target.value }))}
                  className="bg-input/50 font-mono"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
