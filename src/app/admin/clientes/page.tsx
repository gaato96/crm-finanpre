'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StarRating } from '@/components/StarRating'
import type { Profile, ClientType } from '@/lib/types'
import { formatDate, formatWhatsAppUrl } from '@/lib/helpers'
import {
  Search,
  UserPlus,
  Users,
  Phone,
  CreditCard,
  TrendingUp,
  ArrowRight,
  Filter,
  Calendar,
  Star,
  LayoutList,
  SlidersHorizontal,
  Info,
  Pencil,
  Trash2,
  MoreHorizontal,
  MessageCircle,
} from 'lucide-react'
import Link from 'next/link'
import { adminCreateClient } from './actions'

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type ClientWithData = Profile & {
  contracts_count: number
  credits_count: number
}

type FilterType = 'todos' | 'investor' | 'borrower' | 'both'

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getClientTypeLabel(type: ClientType): string {
  const labels: Record<ClientType, string> = {
    investor: 'Inversor',
    borrower: 'Deudor',
    both: 'Ambos',
  }
  return labels[type] ?? type
}

function getClientTypeBadgeClass(type: ClientType): string {
  const classes: Record<ClientType, string> = {
    investor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    borrower: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    both: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  }
  return classes[type] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
}

function getAvatarGradient(type: ClientType): string {
  const gradients: Record<ClientType, string> = {
    investor: 'from-emerald-500 to-emerald-700',
    borrower: 'from-orange-500 to-orange-700',
    both: 'from-blue-500 to-blue-700',
  }
  return gradients[type] ?? 'from-slate-500 to-slate-700'
}

// ─────────────────────────────────────────────────────────
// Nuevo Cliente Form State
// ─────────────────────────────────────────────────────────
interface NewClientForm {
  full_name: string
  dni: string
  phone: string
  email: string
  address: string
  client_type: ClientType
  trust_level: number
  notes: string
  password: string
}

const defaultForm: NewClientForm = {
  full_name: '',
  dni: '',
  phone: '',
  email: '',
  address: '',
  client_type: 'investor',
  trust_level: 3,
  notes: '',
  password: '',
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────
export default function ClientesPage() {
  const [clients, setClients] = useState<ClientWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('todos')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NewClientForm>(defaultForm)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientWithData | null>(null)
  const [editForm, setEditForm] = useState<Omit<NewClientForm, 'password'>>({
    full_name: '', dni: '', phone: '', email: '', address: '', client_type: 'investor', trust_level: 3, notes: '',
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // Delete state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'investor')
      .order('created_at', { ascending: false })

    if (!profiles) {
      setLoading(false)
      return
    }

    // Fetch contract/credit counts in parallel
    const enriched: ClientWithData[] = await Promise.all(
      (profiles as Profile[]).map(async (p) => {
        const [contractsRes, creditsRes] = await Promise.all([
          supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('client_id', p.id),
          supabase.from('credits').select('id', { count: 'exact', head: true }).eq('client_id', p.id),
        ])
        return {
          ...p,
          contracts_count: contractsRes.count ?? 0,
          credits_count: creditsRes.count ?? 0,
        }
      })
    )

    setClients(enriched)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // ── Filtering ──
  const filtered = clients.filter((c) => {
    const term = search.toLowerCase()
    const matchSearch =
      c.full_name.toLowerCase().includes(term) ||
      c.dni.toLowerCase().includes(term) ||
      (c.email ?? '').toLowerCase().includes(term)
    const matchType = filterType === 'todos' || c.client_type === filterType
    return matchSearch && matchType
  })

  // ── Form helpers ──
  const setField = <K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)

    // Create client using the server action to prevent session issues
    const res = await adminCreateClient({
      email: form.email,
      password: form.password,
      full_name: form.full_name,
      dni: form.dni,
      phone: form.phone || undefined,
      address: form.address || undefined,
      client_type: form.client_type,
      trust_level: form.trust_level,
      notes: form.notes || undefined,
    })

    if (res.error) {
      setCreateError(res.error)
      setCreating(false)
      return
    }

    setDialogOpen(false)
    setForm(defaultForm)
    setCreating(false)
    fetchClients()
  }

  // ── Edit handler ──
  const openEditDialog = (client: ClientWithData) => {
    setEditingClient(client)
    setEditForm({
      full_name: client.full_name,
      dni: client.dni,
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      client_type: client.client_type,
      trust_level: client.trust_level,
      notes: client.notes || '',
    })
    setEditError(null)
    setEditDialogOpen(true)
  }

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingClient) return
    setEditSaving(true)
    setEditError(null)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name,
      dni: editForm.dni,
      phone: editForm.phone || null,
      email: editForm.email || null,
      address: editForm.address || null,
      client_type: editForm.client_type,
      trust_level: editForm.trust_level,
      notes: editForm.notes || null,
    }).eq('id', editingClient.id)
    if (error) {
      setEditError(error.message)
      setEditSaving(false)
      return
    }
    setEditDialogOpen(false)
    setEditSaving(false)
    fetchClients()
  }

  // ── Delete handler ──
  const handleDeleteClient = async (clientId: string) => {
    setDeleting(true)
    const supabase = createClient()
    const { error } = await supabase.rpc('delete_user_admin', { user_id: clientId })
    if (error) {
      alert('Error al eliminar: ' + error.message)
    }
    setDeleteConfirmId(null)
    setDeleting(false)
    fetchClients()
  }

  // ── Filter buttons config ──
  const filterButtons: { key: FilterType; label: string; icon?: React.ReactNode }[] = [
    { key: 'todos', label: 'Todos', icon: <Filter className="w-3.5 h-3.5" /> },
    { key: 'investor', label: 'Inversores', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: 'borrower', label: 'Deudores', icon: <CreditCard className="w-3.5 h-3.5" /> },
    { key: 'both', label: 'Ambos', icon: <SlidersHorizontal className="w-3.5 h-3.5" /> },
  ]

  // ── Stats summary ──
  const statsInversores = clients.filter((c) => c.client_type === 'investor').length
  const statsDeudores = clients.filter((c) => c.client_type === 'borrower').length
  const statsAmbos = clients.filter((c) => c.client_type === 'both').length

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold gradient-text">Gestión de Clientes</h1>
              <p className="text-muted-foreground text-sm">Directorio completo del CRM · {clients.length} clientes registrados</p>
            </div>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/25 transition-all duration-200" />
            }
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nuevo Cliente
          </DialogTrigger>

          <DialogContent className="glass-card border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold gradient-text">Registrar Nuevo Cliente</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateClient} className="space-y-4 mt-2">
              {/* Name + DNI */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Nombre completo <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setField('full_name', e.target.value)}
                    required
                    placeholder="Juan Pérez"
                    className="bg-input/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    DNI <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    value={form.dni}
                    onChange={(e) => setField('dni', e.target.value)}
                    required
                    placeholder="12345678"
                    className="bg-input/50"
                  />
                </div>
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="+54 11 1234-5678"
                    className="bg-input/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Email <span className="text-red-400">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    required
                    placeholder="cliente@email.com"
                    className="bg-input/50"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Dirección</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  placeholder="Av. Corrientes 1234, CABA"
                  className="bg-input/50"
                />
              </div>

              {/* Client type + Trust level */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tipo de cliente</Label>
                  <Select value={form.client_type} onValueChange={(v) => setField('client_type', v as ClientType)}>
                    <SelectTrigger className="bg-input/50 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="investor">Inversor</SelectItem>
                      <SelectItem value="borrower">Deudor</SelectItem>
                      <SelectItem value="both">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nivel de confianza</Label>
                  <div className="flex items-center gap-3 mt-1">
                    <StarRating value={form.trust_level} onChange={(val) => setField('trust_level', val)} size="md" />
                    <span className="text-xs text-muted-foreground tabular-nums">{form.trust_level.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Notas internas</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Observaciones sobre el cliente..."
                  className="bg-input/50 resize-none min-h-[72px]"
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Contraseña inicial (portal) <span className="text-red-400">*</span>
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  required
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  className="bg-input/50"
                />
              </div>

              {/* Info note */}
              <div className="flex gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Se creará un acceso al portal inversor con el email y contraseña indicados. El cliente recibirá un email de confirmación.</p>
              </div>

              {/* Error */}
              {createError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {createError}
                </p>
              )}

              <Button
                type="submit"
                disabled={creating}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/20 transition-all"
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Creando cliente...
                  </span>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Crear Cliente
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Quick Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Clientes', value: clients.length, icon: <Users className="w-4 h-4" />, color: 'text-foreground', bg: 'bg-accent/50' },
          { label: 'Inversores', value: statsInversores, icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Deudores', value: statsDeudores, icon: <CreditCard className="w-4 h-4" />, color: 'text-orange-400', bg: 'bg-orange-500/10' },
          { label: 'Ambos', value: statsAmbos, icon: <SlidersHorizontal className="w-4 h-4" />, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map((stat) => (
          <Card key={stat.label} className="glass-card card-hover">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${stat.bg} flex items-center justify-center ${stat.color} shrink-0`}>
                {stat.icon}
              </div>
              <div>
                <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Search + Filters ── */}
      <Card className="glass-card">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, DNI o email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-input/50"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {filterButtons.map(({ key, label, icon }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filterType === key ? 'default' : 'outline'}
                  onClick={() => setFilterType(key)}
                  className={
                    filterType === key
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                      : 'border-border/50 hover:bg-accent/50'
                  }
                >
                  {icon}
                  <span className="ml-1.5">{label}</span>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Client Table ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin" />
          <p className="text-muted-foreground text-sm">Cargando clientes...</p>
        </div>
      ) : (
        <Card className="glass-card overflow-hidden">
          {filtered.length === 0 ? (
            <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-20 h-20 rounded-2xl bg-accent/50 flex items-center justify-center">
                <Users className="w-10 h-10 text-muted-foreground/30" />
              </div>
              <div className="text-center">
                <p className="font-medium text-muted-foreground">
                  {search || filterType !== 'todos' ? 'No se encontraron clientes con ese criterio' : 'Aún no hay clientes registrados'}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {search || filterType !== 'todos' ? 'Intentá con otro término o filtro' : 'Hacé clic en "Nuevo Cliente" para comenzar'}
                </p>
              </div>
              {!search && filterType === 'todos' && (
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold mt-2"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Nuevo Cliente
                </Button>
              )}
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider pl-4">
                    <div className="flex items-center gap-1.5">
                      <LayoutList className="w-3.5 h-3.5" /> Cliente
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">Tipo</TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider">
                    <div className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> Confianza</div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">
                    <div className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Teléfono</div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider hidden xl:table-cell">
                    <div className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Contratos</div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider hidden xl:table-cell">
                    <div className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Créditos</div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Alta</div>
                  </TableHead>
                  <TableHead className="text-muted-foreground font-semibold text-xs uppercase tracking-wider text-right pr-4">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((client, i) => (
                  <TableRow
                    key={client.id}
                    className="border-border/30 hover:bg-accent/40 transition-colors"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {/* Avatar + Name */}
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getAvatarGradient(client.client_type)} flex items-center justify-center text-white text-sm font-bold shadow-md shrink-0`}
                        >
                          {getInitials(client.full_name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{client.full_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">DNI {client.dni}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Client Type */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${getClientTypeBadgeClass(client.client_type)}`}
                      >
                        {client.client_type === 'investor' && <TrendingUp className="w-3 h-3 mr-1" />}
                        {client.client_type === 'borrower' && <CreditCard className="w-3 h-3 mr-1" />}
                        {client.client_type === 'both' && <SlidersHorizontal className="w-3 h-3 mr-1" />}
                        {getClientTypeLabel(client.client_type)}
                      </Badge>
                    </TableCell>

                    {/* Trust Level */}
                    <TableCell>
                      <StarRating value={client.trust_level} readOnly size="sm" />
                    </TableCell>

                    {/* Phone */}
                    <TableCell className="hidden lg:table-cell">
                      {client.phone ? (
                        <div className="flex items-center gap-1.5">
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="w-3.5 h-3.5 text-emerald-400/70 shrink-0" />
                            {client.phone}
                          </span>
                          {formatWhatsAppUrl(client.phone) && (
                            <a
                              href={formatWhatsAppUrl(client.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Contactar por WhatsApp"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 transition-colors shrink-0"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    {/* Contracts count */}
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold ${client.contracts_count > 0 ? 'text-emerald-400' : 'text-muted-foreground/40'}`}>
                          {client.contracts_count}
                        </span>
                        {client.contracts_count > 0 && (
                          <span className="text-xs text-muted-foreground">contrato{client.contracts_count !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Credits count */}
                    <TableCell className="hidden xl:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold ${client.credits_count > 0 ? 'text-orange-400' : 'text-muted-foreground/40'}`}>
                          {client.credits_count}
                        </span>
                        {client.credits_count > 0 && (
                          <span className="text-xs text-muted-foreground">crédito{client.credits_count !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Created Date */}
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {formatDate(client.created_at)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/clientes/${client.id}`}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1 font-medium h-7 px-2"
                          >
                            Ver
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                        <Link href={`/admin/inversiones?client_id=${client.id}`}>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Nueva Inversión"
                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 h-7 w-7 p-0"
                          >
                            <TrendingUp className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Link href={`/admin/creditos?client_id=${client.id}`}>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Nuevo Crédito"
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-500/10 h-7 w-7 p-0"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditDialog(client)}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 w-7 p-0"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteConfirmId(client.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Footer count */}
          {filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="font-semibold text-foreground">{filtered.length}</span> de{' '}
                <span className="font-semibold text-foreground">{clients.length}</span> clientes
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ── Edit Client Dialog ── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="glass-card border-border/50 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold gradient-text">Editar Cliente</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditClient} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nombre completo</Label>
                <Input value={editForm.full_name} onChange={(e) => setEditForm(p => ({ ...p, full_name: e.target.value }))} required className="bg-input/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">DNI</Label>
                <Input value={editForm.dni} onChange={(e) => setEditForm(p => ({ ...p, dni: e.target.value }))} required className="bg-input/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Teléfono</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} className="bg-input/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Email</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} className="bg-input/50" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Dirección</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm(p => ({ ...p, address: e.target.value }))} className="bg-input/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tipo de cliente</Label>
                <Select value={editForm.client_type} onValueChange={(v) => setEditForm(p => ({ ...p, client_type: v as ClientType }))}>
                  <SelectTrigger className="bg-input/50 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investor">Inversor</SelectItem>
                    <SelectItem value="borrower">Deudor</SelectItem>
                    <SelectItem value="both">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nivel de confianza</Label>
                <div className="flex items-center gap-3 mt-1">
                  <StarRating value={editForm.trust_level} onChange={(val) => setEditForm(p => ({ ...p, trust_level: val }))} size="md" />
                  <span className="text-xs text-muted-foreground tabular-nums">{editForm.trust_level.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Notas internas</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm(p => ({ ...p, notes: e.target.value }))} className="bg-input/50 resize-none min-h-[72px]" />
            </div>
            {editError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{editError}</p>}
            <Button type="submit" disabled={editSaving} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white font-semibold">
              {editSaving ? <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />Guardando...</> : <><Pencil className="w-4 h-4 mr-2" />Guardar Cambios</>}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <DialogContent className="glass-card border-border/50 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-400">Eliminar Cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">¿Estás seguro de que querés eliminar este cliente? Esta acción no se puede deshacer.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button
              disabled={deleting}
              onClick={() => deleteConfirmId && handleDeleteClient(deleteConfirmId)}
              className="flex-1 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 font-semibold"
            >
              {deleting ? <><span className="w-4 h-4 rounded-full border-2 border-red-400 border-t-transparent animate-spin mr-2" />Eliminando...</> : <><Trash2 className="w-4 h-4 mr-2" />Eliminar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
