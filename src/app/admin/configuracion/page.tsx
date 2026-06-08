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
} from 'lucide-react'

export default function ConfiguracionPage() {
  const [config, setConfig] = useState<ValuationConfig>(DEFAULT_VALUATION_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Custom zones additions
  const [newZoneName, setNewZoneName] = useState('')
  const [newZonePrice, setNewZonePrice] = useState('')

  const supabase = createClient()

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'valuation_config')
        .single()

      if (error) {
        console.warn('Config not found or RLS issue, using defaults:', error.message)
      } else if (data && data.value) {
        setConfig(data.value as ValuationConfig)
      }
      setLoading(false)
    }

    fetchConfig()
  }, [supabase])

  const handleSave = async () => {
    setSaving(true)
    setStatus(null)

    const { error } = await supabase
      .from('system_settings')
      .upsert({
        key: 'valuation_config',
        value: config,
        updated_at: new Date().toISOString(),
      })

    if (error) {
      setStatus({ type: 'error', message: 'Error al guardar los ajustes: ' + error.message })
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
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
