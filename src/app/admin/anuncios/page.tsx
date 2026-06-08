'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Megaphone,
  Plus,
  Search,
  Trash2,
  Loader2,
  Info,
  AlertTriangle,
  Flame,
  Check,
  X,
} from 'lucide-react'
import { formatDate } from '@/lib/helpers'

type Announcement = {
  id: string
  title: string
  content: string
  type: 'info' | 'promo' | 'warning'
  target_role: string
  active: boolean
  created_at: string
}

const TYPE_ICONS = {
  info: <Info className="w-4 h-4 text-blue-400" />,
  promo: <Flame className="w-4 h-4 text-emerald-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-orange-400" />,
}

const TYPE_BADGES = {
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  promo: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  warning: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
}

export default function AnunciosPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<'info' | 'promo' | 'warning'>('info')
  const [active, setActive] = useState(true)

  const supabase = createClient()

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      console.error('Error fetching announcements:', fetchError)
    } else {
      setAnnouncements(data || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase.from('announcements').insert({
      title,
      content,
      type,
      active,
      target_role: 'investor',
    })

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    setDialogOpen(false)
    setTitle('')
    setContent('')
    setType('info')
    setActive(true)
    setSubmitting(false)
    fetchAnnouncements()
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error: updateError } = await supabase
      .from('announcements')
      .update({ active: !currentStatus })
      .eq('id', id)

    if (updateError) {
      alert('Error al actualizar estado: ' + updateError.message)
    } else {
      fetchAnnouncements()
    }
  }

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este anuncio?')) return
    const { error: deleteError } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id)

    if (deleteError) {
      alert('Error al eliminar anuncio: ' + deleteError.message)
    } else {
      fetchAnnouncements()
    }
  }

  const filtered = announcements.filter((a) => {
    const term = search.toLowerCase()
    return (
      a.title.toLowerCase().includes(term) ||
      a.content.toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold gradient-text">Gestión de Anuncios</h1>
            <p className="text-muted-foreground text-sm">
              Publica anuncios, alertas y promociones directamente en el panel de los inversores
            </p>
          </div>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setError(null) }}>
          <DialogTrigger
            render={
              <Button className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/25 transition-all duration-200" />
            }
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Anuncio
          </DialogTrigger>

          <DialogContent className="glass-card border-border/50 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold gradient-text">Crear Nuevo Anuncio</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreateAnnouncement} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Título del Anuncio</Label>
                <Input
                  id="title"
                  required
                  placeholder="¡Nueva Rentabilidad en USD! 7.5% Mensual"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-input/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type">Tipo de Anuncio</Label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="info">🔵 Informativo</option>
                  <option value="promo">🟢 Promocional / Activos</option>
                  <option value="warning">🟠 Alerta / Urgente</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="content">Contenido</Label>
                <Textarea
                  id="content"
                  required
                  placeholder="Escribe el mensaje detallado para los inversores. Por ejemplo: Recibimos un departamento en Barrio Sur como parte de pago, financiado con excelentes tasas de retorno..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="bg-input/50 resize-none min-h-[100px]"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-accent/30 border border-border/30">
                <div>
                  <Label htmlFor="active" className="text-sm font-medium">Publicar Inmediatamente</Label>
                  <p className="text-xs text-muted-foreground">Estará visible al instante para los inversores</p>
                </div>
                <input
                  id="active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold shadow-lg shadow-emerald-500/20 transition-all"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publicando anuncio...
                  </span>
                ) : (
                  <>
                    <Megaphone className="w-4 h-4 mr-2" />
                    Publicar Anuncio
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search panel */}
      <Card className="glass-card">
        <CardContent className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar anuncios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-input/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* Announcements Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          <p className="text-muted-foreground text-sm">Cargando anuncios...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Megaphone className="w-12 h-12 mb-3 text-muted-foreground/20" />
            <p className="font-semibold">No se encontraron anuncios</p>
            <p className="text-xs mt-1">Crea un nuevo anuncio para comenzar.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase pl-4">Tipo</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase">Anuncio</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase hidden sm:table-cell">Fecha de Publicación</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase">Estado</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-xs uppercase text-right pr-4">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((announcement) => (
                <TableRow key={announcement.id} className="border-border/30 hover:bg-accent/40 transition-colors">
                  <TableCell className="pl-4">
                    <Badge variant="outline" className={`flex items-center gap-1.5 w-fit ${TYPE_BADGES[announcement.type]}`}>
                      {TYPE_ICONS[announcement.type]}
                      <span className="capitalize">{announcement.type}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs md:max-w-md">
                    <div>
                      <p className="font-semibold text-sm truncate">{announcement.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{announcement.content}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{formatDate(announcement.created_at)}</TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleToggleActive(announcement.id, announcement.active)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                        announcement.active
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                          : 'bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/25'
                      }`}
                    >
                      {announcement.active ? (
                        <>
                          <Check className="w-3 h-3" /> Visible
                        </>
                      ) : (
                        <>
                          <X className="w-3 h-3" /> Oculto
                        </>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteAnnouncement(announcement.id)}
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
