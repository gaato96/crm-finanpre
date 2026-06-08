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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminCreateSeller, adminDeleteSeller } from './actions'
import {
  Search,
  UserPlus,
  Users,
  Phone,
  Calendar,
  Trash2,
  Briefcase,
  Loader2,
  Mail,
  Fingerprint,
} from 'lucide-react'
import { formatDate } from '@/lib/helpers'

type SellerProfile = {
  id: string
  full_name: string
  dni: string
  phone: string | null
  email: string | null
  created_at: string
}

export default function VendedoresPage() {
  const [sellers, setSellers] = useState<SellerProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [fullName, setFullName] = useState('')
  const [dni, setDni] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const fetchSellers = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'vendedor')
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Error fetching sellers:', fetchError)
    } else {
      setSellers((data as SellerProfile[]) || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSellers()
  }, [fetchSellers])

  const handleCreateSeller = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)

    const res = await adminCreateSeller({
      email,
      password,
      full_name: fullName,
      dni,
      phone: phone || undefined,
    })

    if (res.error) {
      setError(res.error)
      setCreating(false)
      return
    }

    setDialogOpen(false)
    setFullName('')
    setDni('')
    setPhone('')
    setEmail('')
    setPassword('')
    setCreating(false)
    fetchSellers()
  }

  const handleDeleteSeller = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar a ${name}? Esto borrará permanentemente su cuenta.`)) return
    setLoading(true)
    const res = await adminDeleteSeller(id)
    if (res.error) {
      alert('Error al eliminar vendedor: ' + res.error)
    } else {
      fetchSellers()
    }
  }

  const filtered = sellers.filter((s) => {
    const term = search.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(term) ||
      s.dni.toLowerCase().includes(term) ||
      (s.email ?? '').toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold gradient-text">Gestión de Vendedores</h1>
            <p className="text-muted-foreground text-sm">
              Equipo de ventas con permisos de creación de clientes, contratos y créditos
            </p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setError(null) }}>
          <DialogTrigger
            render={
              <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/25 transition-all duration-200" />
            }
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Nuevo Vendedor
          </DialogTrigger>

          <DialogContent className="glass-card border-border/50 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold gradient-text">Registrar Nuevo Vendedor</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateSeller} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Nombre Completo</Label>
                <Input
                  id="fullName"
                  required
                  placeholder="Gaston Albornoz"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-input/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dni">DNI</Label>
                  <Input
                    id="dni"
                    required
                    placeholder="38456789"
                    value={dni}
                    onChange={(e) => setDni(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input
                    id="phone"
                    placeholder="+54 381 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Correo Electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="vendedor@finanpre.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-input/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña Temporal</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-input/50"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={creating}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/20 transition-all"
              >
                {creating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creando vendedor...
                  </span>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Crear Vendedor
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Stat */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-400">{sellers.length}</p>
              <p className="text-xs text-muted-foreground">Vendedores Activos</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search panel */}
      <Card className="glass-card">
        <CardContent className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, DNI o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-input/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* Sellers Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-muted-foreground text-sm">Cargando equipo de ventas...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Briefcase className="w-12 h-12 mb-3 text-muted-foreground/20" />
            <p className="font-semibold">No se encontraron vendedores</p>
            <p className="text-xs mt-1">Registra uno nuevo haciendo clic en "Nuevo Vendedor".</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase pl-4">Vendedor</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase hidden sm:table-cell">DNI</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase hidden md:table-cell">Teléfono</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase hidden lg:table-cell">Fecha Alta</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase text-right pr-4">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((seller) => (
                <TableRow key={seller.id} className="border-border/30 hover:bg-accent/40 transition-colors">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                        {seller.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{seller.full_name}</p>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {seller.email || 'Sin email'}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm hidden sm:table-cell">
                    <span className="flex items-center gap-1">
                      <Fingerprint className="w-3.5 h-3.5 text-muted-foreground" />
                      {seller.dni}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {seller.phone ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400/50" />
                        {seller.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{formatDate(seller.created_at)}</TableCell>
                  <TableCell className="text-right pr-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteSeller(seller.id, seller.full_name)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 gap-1 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
