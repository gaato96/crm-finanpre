'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Package,
  Plus,
  Search,
  Tag,
  Car,
  Building2,
  Coins,
  Banknote,
  MoreVertical,
  CheckCircle,
  Clock,
  Archive,
  ArrowRight,
  TrendingUp,
  Loader2,
  Trash2,
  Edit3,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/helpers'
import type { AssetAvailable, AssetType, AvailableAssetStatus, Currency, Profile } from '@/lib/types'

type FilterType = 'todos' | AssetType
type StatusFilter = 'todos' | AvailableAssetStatus

const ASSET_ICONS: Record<AssetType, React.ReactNode> = {
  vehiculo: <Car className="w-5 h-5" />,
  inmueble: <Building2 className="w-5 h-5" />,
  pesos: <Coins className="w-5 h-5" />,
  dolares: <Banknote className="w-5 h-5" />,
  otro: <Package className="w-5 h-5" />,
}

const ASSET_COLORS: Record<AssetType, string> = {
  vehiculo: 'from-orange-500 to-amber-600 shadow-orange-500/10 text-orange-400',
  inmueble: 'from-indigo-500 to-blue-600 shadow-indigo-500/10 text-indigo-400',
  pesos: 'from-emerald-500 to-teal-600 shadow-emerald-500/10 text-emerald-400',
  dolares: 'from-blue-500 to-cyan-600 shadow-blue-500/10 text-blue-400',
  otro: 'from-slate-500 to-slate-700 shadow-slate-500/10 text-slate-400',
}

const STATUS_BADGES: Record<AvailableAssetStatus, string> = {
  disponible: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  reservado: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  vendido: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

interface EnrichedAsset extends AssetAvailable {
  assets_valuation?: {
    description: string
    profiles?: {
      full_name: string
    }
  } | null
}

export default function ActivosPage() {
  const supabase = createClient()

  // Data states
  const [assets, setAssets] = useState<EnrichedAsset[]>([])
  const [valuations, setValuations] = useState<{ id: string; description: string; profiles?: { full_name: string } }[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<FilterType>('todos')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')

  // Modals
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editAsset, setEditAsset] = useState<EnrichedAsset | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formType, setFormType] = useState<AssetType>('vehiculo')
  const [formVal, setFormVal] = useState('')
  const [formCurrency, setFormCurrency] = useState<Currency>('ARS')
  const [formStatus, setFormStatus] = useState<AvailableAssetStatus>('disponible')
  const [formValuationId, setFormValuationId] = useState<string>('')

  // Fetch all assets & valuations
  const fetchData = useCallback(async () => {
    setLoading(true)

    // Fetch available assets with joined client valuation descriptions
    const { data: assetsData } = await supabase
      .from('assets_available')
      .select('*, assets_valuation(description, client_id)')
      .order('created_at', { ascending: false })

    // Resolve clients for valuations if any
    const enriched: EnrichedAsset[] = []
    if (assetsData) {
      for (const asset of assetsData) {
        let valuationDetails = null
        if (asset.assets_valuation) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', asset.assets_valuation.client_id)
            .single()

          valuationDetails = {
            description: asset.assets_valuation.description,
            profiles: profileData ? { full_name: profileData.full_name } : undefined,
          }
        }
        enriched.push({
          ...asset,
          assets_valuation: valuationDetails,
        })
      }
    }

    setAssets(enriched)

    // Fetch active valuations to link them if needed
    const { data: valData } = await supabase
      .from('assets_valuation')
      .select('id, description, client_id')
      .eq('status', 'tasado')

    const enrichedValuations = []
    if (valData) {
      for (const val of valData) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', val.client_id)
          .single()

        enrichedValuations.push({
          id: val.id,
          description: val.description,
          profiles: prof ? { full_name: prof.full_name } : undefined,
        })
      }
    }

    setValuations(enrichedValuations)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Create handler
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formTitle || !formVal) return
    setSubmitting(true)

    try {
      const { error } = await supabase.from('assets_available').insert({
        title: formTitle,
        description: formDesc || null,
        asset_type: formType,
        listed_value: parseFloat(formVal),
        currency: formCurrency,
        status: formStatus,
        asset_valuation_id: formValuationId || null,
      })

      if (error) throw error

      setCreateDialogOpen(false)
      resetForm()
      fetchData()
    } catch (err: any) {
      alert('Error al guardar el activo: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Edit handler
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editAsset || !formTitle || !formVal) return
    setSubmitting(true)

    try {
      const { error } = await supabase
        .from('assets_available')
        .update({
          title: formTitle,
          description: formDesc || null,
          asset_type: formType,
          listed_value: parseFloat(formVal),
          currency: formCurrency,
          status: formStatus,
          asset_valuation_id: formValuationId || null,
        })
        .eq('id', editAsset.id)

      if (error) throw error

      setEditAsset(null)
      resetForm()
      fetchData()
    } catch (err: any) {
      alert('Error al actualizar el activo: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // Delete handler
  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este activo disponible?')) return
    await supabase.from('assets_available').delete().eq('id', id)
    fetchData()
  }

  const resetForm = () => {
    setFormTitle('')
    setFormDesc('')
    setFormType('vehiculo')
    setFormVal('')
    setFormCurrency('ARS')
    setFormStatus('disponible')
    setFormValuationId('')
  }

  const startEdit = (asset: EnrichedAsset) => {
    setEditAsset(asset)
    setFormTitle(asset.title)
    setFormDesc(asset.description || '')
    setFormType(asset.asset_type)
    setFormVal(asset.listed_value.toString())
    setFormCurrency(asset.currency)
    setFormStatus(asset.status)
    setFormValuationId(asset.asset_valuation_id || '')
  }

  // Filtered Assets
  const filtered = assets.filter((a) => {
    const matchesSearch =
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'todos' || a.asset_type === typeFilter
    const matchesStatus = statusFilter === 'todos' || a.status === statusFilter
    return matchesSearch && matchesType && matchesStatus
  })

  // Summary counts
  const totalCount = assets.length
  const dispCount = assets.filter((a) => a.status === 'disponible').length
  const resCount = assets.filter((a) => a.status === 'reservado').length
  const valueARS = assets
    .filter((a) => a.status === 'disponible' && a.currency === 'ARS')
    .reduce((sum, a) => sum + Number(a.listed_value), 0)
  const valueUSD = assets
    .filter((a) => a.status === 'disponible' && a.currency === 'USD')
    .reduce((sum, a) => sum + Number(a.listed_value), 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold gradient-text">Activos Disponibles</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Catálogo interno de bienes y activos en cartera para financiación
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if(!open) resetForm(); }}>
          <DialogTrigger
            render={
              <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25 transition-all" />
            }
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Activo
          </DialogTrigger>
          <DialogContent className="glass-card border-border/50 max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Registrar Activo Disponible</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Título / Nombre corto</Label>
                <Input
                  required
                  placeholder="Toyota Hilux 2021 SRX"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="bg-input/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Descripción detallada</Label>
                <Textarea
                  placeholder="Hilux color gris, 45.000km, único dueño, lista para transferir..."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="bg-input/50 min-h-[72px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tipo de Activo</Label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AssetType)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="vehiculo">🚗 Vehículo</option>
                    <option value="inmueble">🏢 Inmueble</option>
                    <option value="pesos">💵 Pesos</option>
                    <option value="dolares">🏦 Dólares</option>
                    <option value="otro">📦 Otro</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado Inicial</Label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AvailableAssetStatus)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="disponible">Disponible</option>
                    <option value="reservado">Reservado</option>
                    <option value="vendido">Vendido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Valor Comercial</Label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formVal}
                    onChange={(e) => setFormVal(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label>Moneda</Label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value as Currency)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Vincular a Tasación Cliente (Opcional)</Label>
                <select
                  value={formValuationId}
                  onChange={(e) => setFormValuationId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                >
                  <option value="">Ninguna tasación registrada</option>
                  {valuations.map((val) => (
                    <option key={val.id} value={val.id}>
                      {val.profiles?.full_name} — {val.description.slice(0, 30)}...
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar Activo'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total en Cartera', value: totalCount, desc: 'Activos registrados', icon: <Package className="w-4 h-4" />, color: 'text-foreground' },
          { label: 'Disponibles', value: dispCount, desc: `${resCount} reservados`, icon: <CheckCircle className="w-4 h-4" />, color: 'text-emerald-400' },
          { label: 'Liquidez Disponible (ARS)', value: formatCurrency(valueARS, 'ARS'), desc: 'Valor total sumado', icon: <Coins className="w-4 h-4" />, color: 'text-emerald-400' },
          { label: 'Liquidez Disponible (USD)', value: formatCurrency(valueUSD, 'USD'), desc: 'Valor total sumado', icon: <Banknote className="w-4 h-4" />, color: 'text-blue-400' },
        ].map((stat, i) => (
          <Card key={i} className="glass-card card-hover">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 shrink-0 text-primary">
                {stat.icon}
              </div>
              <div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground/60">{stat.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter panel */}
      <Card className="glass-card">
        <CardContent className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, detalles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-input/50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Type buttons */}
            <div className="flex border border-border/50 rounded-lg p-0.5 bg-input/20">
              {(['todos', 'vehiculo', 'inmueble', 'pesos', 'dolares', 'otro'] as FilterType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md capitalize transition-all ${
                    typeFilter === t
                      ? 'bg-primary/20 text-primary shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t === 'todos' ? 'Todos' : t}
                </button>
              ))}
            </div>

            {/* Status Select */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-9 px-3 rounded-lg border border-border bg-input/40 text-xs focus:outline-none"
            >
              <option value="todos">Todos los Estados</option>
              <option value="disponible">Disponibles</option>
              <option value="reservado">Reservados</option>
              <option value="vendido">Vendidos</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Asset Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Cargando catálogo...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Package className="w-12 h-12 mb-3 text-muted-foreground/20" />
            <p className="font-semibold">No se encontraron activos</p>
            <p className="text-xs mt-1">Intentá cambiar los filtros o creá uno nuevo.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((asset) => {
            const gradient = ASSET_COLORS[asset.asset_type] || ASSET_COLORS.otro
            return (
              <Card key={asset.id} className="glass-card card-hover flex flex-col justify-between overflow-hidden">
                <div>
                  <div className="relative p-4 pb-2 border-b border-border/20 bg-gradient-to-r from-accent/10 to-transparent">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${gradient.split(' ')[0]} ${gradient.split(' ')[1]} flex items-center justify-center text-slate-950 shadow-md shrink-0`}>
                          {ASSET_ICONS[asset.asset_type]}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-sm text-foreground truncate">{asset.title}</h3>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">
                            {asset.asset_type}
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-xs ${STATUS_BADGES[asset.status]}`}>
                        {asset.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-4 space-y-4">
                    <p className="text-xs text-muted-foreground line-clamp-3">
                      {asset.description || 'Sin descripción detallada del activo.'}
                    </p>

                    {/* Valuation / link indicator */}
                    {asset.assets_valuation ? (
                      <div className="p-2.5 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-[11px] text-indigo-300">
                        <p className="font-semibold">Tasado a cliente:</p>
                        <p className="text-slate-400 mt-0.5 truncate">
                          {asset.assets_valuation.profiles?.full_name} · {asset.assets_valuation.description}
                        </p>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-lg bg-slate-900/30 border border-slate-800/40 text-[11px] text-slate-500">
                        <span>Activo libre de tasación individual</span>
                      </div>
                    )}

                    <div className="flex justify-between items-baseline pt-2">
                      <span className="text-xs text-muted-foreground">Valor del Catálogo:</span>
                      <span className="text-lg font-extrabold text-foreground">
                        {formatCurrency(Number(asset.listed_value), asset.currency)}
                      </span>
                    </div>
                  </CardContent>
                </div>

                <div className="p-3 bg-accent/20 border-t border-border/20 flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(asset)}
                    className="text-primary hover:bg-primary/10 h-8 gap-1 text-xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(asset.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 gap-1 text-xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Edit Asset Dialog */}
      <Dialog open={!!editAsset} onOpenChange={(open) => { if (!open) setEditAsset(null) }}>
        <DialogContent className="glass-card border-border/50 max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Activo Disponible</DialogTitle>
          </DialogHeader>
          {editAsset && (
            <form onSubmit={handleEdit} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Título / Nombre corto</Label>
                <Input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="bg-input/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Descripción detallada</Label>
                <Textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  className="bg-input/50 min-h-[72px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Tipo de Activo</Label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AssetType)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                  >
                    <option value="vehiculo">🚗 Vehículo</option>
                    <option value="inmueble">🏢 Inmueble</option>
                    <option value="pesos">💵 Pesos</option>
                    <option value="dolares">🏦 Dólares</option>
                    <option value="otro">📦 Otro</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as AvailableAssetStatus)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                  >
                    <option value="disponible">Disponible</option>
                    <option value="reservado">Reservado</option>
                    <option value="vendido">Vendido</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Valor Comercial</Label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    value={formVal}
                    onChange={(e) => setFormVal(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
                <div className="col-span-1 space-y-1.5">
                  <Label>Moneda</Label>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value as Currency)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Vincular a Tasación Cliente (Opcional)</Label>
                <select
                  value={formValuationId}
                  onChange={(e) => setFormValuationId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none"
                >
                  <option value="">Ninguna tasación registrada</option>
                  {valuations.map((val) => (
                    <option key={val.id} value={val.id}>
                      {val.profiles?.full_name} — {val.description.slice(0, 30)}...
                    </option>
                  ))}
                </select>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar Cambios'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
