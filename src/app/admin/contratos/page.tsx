'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  FileText,
  Plus,
  Search,
  Eye,
  Copy,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
  PenLine,
  FileSignature,
  Filter,
  ExternalLink,
  Settings,
  BookTemplate,
  RefreshCw,
  Trash2,
  Check,
  Loader2,
} from 'lucide-react'
import { formatDate, formatDateTime, getContractStatusLabel, getContractStatusColor, formatCurrency } from '@/lib/helpers'
import type { Contract, ContractTemplate, Profile } from '@/lib/types'

type FilterType = 'todos' | 'borrador' | 'enviado' | 'pendiente_fondos' | 'activo' | 'retiro_solicitado' | 'retirado'

const STATUS_ICONS: Record<string, React.ReactNode> = {
  borrador: <PenLine className="w-3.5 h-3.5" />,
  enviado: <Send className="w-3.5 h-3.5" />,
  pendiente_fondos: <Clock className="w-3.5 h-3.5" />,
  activo: <CheckCircle className="w-3.5 h-3.5" />,
  retiro_solicitado: <AlertCircle className="w-3.5 h-3.5" />,
  retirado: <FileSignature className="w-3.5 h-3.5" />,
  reinvertido: <RefreshCw className="w-3.5 h-3.5" />,
  vencido: <AlertCircle className="w-3.5 h-3.5" />,
}

interface ContractWithProfile extends Contract {
  profiles: Profile
}

export default function ContratosPage() {
  const [contracts, setContracts] = useState<ContractWithProfile[]>([])
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('todos')
  const [selectedContract, setSelectedContract] = useState<ContractWithProfile | null>(null)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const fetchData = async () => {
    const supabase = createClient()
    const [contractsRes, templatesRes] = await Promise.all([
      supabase
        .from('contracts')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('contract_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])
    setContracts((contractsRes.data || []) as ContractWithProfile[])
    setTemplates((templatesRes.data || []) as ContractTemplate[])
    setLoading(false)
  }

  const handleConfirmPayment = async (contractId: string) => {
    setSubmittingId(contractId)
    const supabase = createClient()
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'activo' })
      .eq('id', contractId)
    if (!error) {
      await supabase.from('contract_events').insert({
        contract_id: contractId,
        event_type: 'funds_confirmed',
        metadata: { confirmed_at: new Date().toISOString() },
      })

      // Check if we need to add the asset to assets_available
      const { data: contractData } = await supabase
        .from('contracts')
        .select('*, profiles(full_name)')
        .eq('id', contractId)
        .single()

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

      await fetchData()
    } else {
      alert('Error al confirmar pago: ' + error.message)
    }
    setSubmittingId(null)
  }

  const handleDeleteDraft = async (contractId: string) => {
    if (!confirm('¿Seguro que querés eliminar este borrador?')) return
    setSubmittingId(contractId)
    const supabase = createClient()
    const { error } = await supabase
      .from('contracts')
      .delete()
      .eq('id', contractId)
    if (!error) {
      await fetchData()
    } else {
      alert('Error al eliminar borrador: ' + error.message)
    }
    setSubmittingId(null)
  }

  useEffect(() => { fetchData() }, [])

  const filtered = contracts.filter(c => {
    const matchSearch =
      c.profiles?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'todos' || c.status === filter
    return matchSearch && matchFilter
  })

  const pendingWithdrawals = contracts.filter(c => c.status === 'retiro_solicitado')

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/firmar/${token}`
    await navigator.clipboard.writeText(link)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  const handleDuplicateTemplate = async (template: ContractTemplate) => {
    const supabase = createClient()
    const newName = `Copia de ${template.name}`
    const { error } = await supabase
      .from('contract_templates')
      .insert({
        name: newName,
        type: template.type,
        content: template.content,
        variables: template.variables,
        is_active: false,
        version: 1,
      })

    if (error) {
      alert('Error al duplicar la plantilla: ' + error.message)
    } else {
      fetchData()
    }
  }

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'borrador', label: 'Borradores' },
    { key: 'enviado', label: 'Enviados' },
    { key: 'pendiente_fondos', label: 'Pend. Fondos' },
    { key: 'activo', label: 'Activos' },
    { key: 'retiro_solicitado', label: 'Retiros' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contratos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Gestión de contratos y plantillas</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/contratos/plantillas"
            className={cn(buttonVariants({ variant: 'outline' }), "gap-2")}
          >
            <BookTemplate className="w-4 h-4" />
            Plantillas
          </Link>
        </div>
      </div>

      {/* Alert: retiros pendientes */}
      {pendingWithdrawals.length > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-orange-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-400">
              {pendingWithdrawals.length} retiro{pendingWithdrawals.length > 1 ? 's' : ''} pendiente{pendingWithdrawals.length > 1 ? 's' : ''} de confirmación
            </p>
            <p className="text-xs text-muted-foreground">Los clientes han solicitado retirar su inversión</p>
          </div>
          <Button size="sm" variant="outline" className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10" onClick={() => setFilter('retiro_solicitado')}>
            Ver retiros
          </Button>
        </div>
      )}

      <Tabs defaultValue="contratos">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="contratos" className="gap-2">
            <FileText className="w-4 h-4" />
            Contratos ({contracts.length})
          </TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-2">
            <BookTemplate className="w-4 h-4" />
            Plantillas ({templates.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB: Contratos */}
        <TabsContent value="contratos" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente o ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {filterButtons.map(fb => (
                <Button
                  key={fb.key}
                  size="sm"
                  variant={filter === fb.key ? 'default' : 'outline'}
                  onClick={() => setFilter(fb.key)}
                  className="h-9"
                >
                  {fb.label}
                </Button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                <FileText className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No hay contratos{filter !== 'todos' ? ' con este filtro' : ''}</p>
                <p className="text-xs text-muted-foreground mt-1">Los contratos se crean desde el módulo de Inversiones o Créditos</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(contract => (
                <Card key={contract.id} className="glass-card card-hover">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Status icon + info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${getContractStatusColor(contract.status)}`}>
                          {STATUS_ICONS[contract.status] ?? <FileText className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{contract.profiles?.full_name}</p>
                            <Badge variant="outline" className={`text-xs ${getContractStatusColor(contract.status)}`}>
                              {getContractStatusLabel(contract.status)}
                            </Badge>
                            <span className="text-xs bg-slate-900 px-2 py-0.5 rounded border border-border/50 font-mono text-slate-300">
                              {formatCurrency(Number(contract.initial_capital), contract.currency)} · {contract.monthly_rate}% mes
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ID: {contract.id.slice(0, 8)}... · Creado: {formatDate(contract.created_at)}
                            {contract.contract_signed_at && ` · Firmado: ${formatDate(contract.contract_signed_at)}`}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <Link
                          href={`/admin/clientes/${contract.client_id}`}
                          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "h-8 gap-1.5")}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Cliente
                        </Link>

                        {contract.status === 'pendiente_fondos' && (
                          <Button
                            size="sm"
                            className="h-8 gap-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30"
                            onClick={() => handleConfirmPayment(contract.id)}
                            disabled={submittingId === contract.id}
                          >
                            {submittingId === contract.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Confirmar Pago
                          </Button>
                        )}

                        {contract.status === 'borrador' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10"
                            onClick={() => handleDeleteDraft(contract.id)}
                            disabled={submittingId === contract.id}
                          >
                            {submittingId === contract.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Eliminar
                          </Button>
                        )}

                        {(contract.status === 'enviado' || contract.status === 'borrador') && contract.sign_token && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-blue-400/30 text-blue-400 hover:bg-blue-400/10"
                            onClick={() => { setSelectedContract(contract); setShowLinkDialog(true) }}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Link firma
                          </Button>
                        )}

                        {contract.contract_pdf_url && (
                          <a
                            href={contract.contract_pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "h-8 gap-1.5")}
                          >
                            <FileSignature className="w-3.5 h-3.5" />
                            PDF
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* TAB: Plantillas */}
        <TabsContent value="plantillas" className="space-y-4 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Plantillas de contratos reutilizables</p>
            <Link
              href="/admin/contratos/plantillas/nueva"
              className={cn(buttonVariants(), "gap-2 bg-primary hover:bg-primary/90")}
            >
              <Plus className="w-4 h-4" />
              Nueva Plantilla
            </Link>
          </div>

          {templates.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="flex flex-col items-center justify-center h-48 text-center">
                <BookTemplate className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No hay plantillas creadas</p>
                <Link
                  href="/admin/contratos/plantillas/nueva"
                  className={cn(buttonVariants(), "mt-4 gap-2")}
                >
                  <Plus className="w-4 h-4" />
                  Crear primera plantilla
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map(t => (
                <Card key={t.id} className="glass-card card-hover">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{t.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Badge variant="outline" className="text-xs">
                            {t.type === 'inversion' ? '📈 Inversión' :
                             t.type === 'credito' ? '💳 Crédito' :
                             t.type === 'servicio' ? '🤝 Servicio' : '📄 Otro'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">v{t.version}</span>
                        </div>
                      </div>
                      <Badge className={t.is_active ? 'bg-emerald-500/20 text-emerald-400 border-0' : 'bg-muted text-muted-foreground border-0'}>
                        {t.is_active ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                      <Settings className="w-3.5 h-3.5" />
                      <span>{Array.isArray(t.variables) ? t.variables.length : 0} variables</span>
                      <span>·</span>
                      <span>{formatDate(t.created_at)}</span>
                    </div>
                    <Separator className="mb-3" />
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/contratos/plantillas/${t.id}`}
                        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), "flex-1 gap-2")}
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        Editar
                      </Link>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDuplicateTemplate(t)}
                        className="flex-1 gap-2 border-primary/20 hover:bg-primary/5 text-primary hover:text-primary"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Duplicar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Signing Link */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-primary" />
              Link de Firma
            </DialogTitle>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compartí este link con <strong>{selectedContract.profiles?.full_name}</strong> para que pueda leer y firmar el contrato digitalmente.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                <code className="text-xs flex-1 break-all text-muted-foreground">
                  {typeof window !== 'undefined' ? `${window.location.origin}/firmar/${selectedContract.sign_token}` : ''}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => selectedContract.sign_token && copyLink(selectedContract.sign_token)}
                  className="shrink-0 gap-1.5"
                >
                  {linkCopied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {linkCopied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <a
                href={`/firmar/${selectedContract.sign_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'outline' }), "w-full gap-2")}
              >
                <ExternalLink className="w-4 h-4" />
                Abrir vista del cliente
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
