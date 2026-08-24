'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fillContractTemplate, formatCurrency, numberToWords, formatDate } from '@/lib/helpers'
import type { TemplateType } from '@/lib/types'
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  FileText,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react'

interface Clause {
  id: string
  title: string
  body: string
}

/** Variables que el sistema reemplaza al generar y firmar el contrato. */
const AVAILABLE_VARIABLES: { key: string; label: string }[] = [
  { key: 'nombre_cliente', label: 'Nombre del cliente' },
  { key: 'dni_cliente', label: 'CUIT / DNI' },
  { key: 'domicilio_cliente', label: 'Domicilio' },
  { key: 'fecha_contrato', label: 'Fecha del contrato' },
  { key: 'fecha_inicio', label: 'Fecha de inicio' },
  { key: 'moneda', label: 'Moneda' },
  { key: 'monto_inicial', label: 'Monto' },
  { key: 'monto_letras', label: 'Monto en letras' },
  { key: 'tasa_mensual', label: 'Tasa mensual' },
  { key: 'fecha_firma', label: 'Fecha de firma' },
  { key: 'hora_firma', label: 'Hora de firma' },
  { key: 'ip_firma', label: 'IP del firmante' },
]

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'inversion', label: '📈 Inversión' },
  { value: 'credito', label: '💳 Crédito' },
  { value: 'servicio', label: '🤝 Servicio' },
  { value: 'otro', label: '📄 Otro' },
]

function newClauseId() {
  return Math.random().toString(36).slice(2, 9)
}

export default function PlantillaEditorPage() {
  const params = useParams()
  const router = useRouter()
  const templateId = params.id as string
  const isNew = templateId === 'nueva'
  const supabase = createClient()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [notFound, setNotFound] = useState(false)

  // Campos de la plantilla
  const [name, setName] = useState('')
  const [type, setType] = useState<TemplateType>('inversion')
  const [isActive, setIsActive] = useState(true)
  const [version, setVersion] = useState(1)
  const [header, setHeader] = useState('')
  const [clauses, setClauses] = useState<Clause[]>([{ id: newClauseId(), title: 'PRIMERA: Objeto', body: '' }])
  const [footer, setFooter] = useState('')

  const load = useCallback(async () => {
    if (isNew) return
    const { data, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('id', templateId)
      .maybeSingle()

    if (error || !data) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setName(data.name || '')
    setType((data.type as TemplateType) || 'inversion')
    setIsActive(!!data.is_active)
    setVersion(data.version || 1)

    // El contenido puede ser JSON estructurado o HTML plano heredado
    try {
      const parsed = JSON.parse(data.content)
      if (!parsed?.isStructured) throw new Error('no estructurado')

      setHeader(parsed.header || '')
      setClauses(
        Array.isArray(parsed.clauses) && parsed.clauses.length > 0
          ? parsed.clauses.map((c: { id?: string; title?: string; body?: string }) => ({
              id: c.id || newClauseId(),
              title: c.title || '',
              body: c.body || '',
            }))
          : [{ id: newClauseId(), title: 'PRIMERA: Objeto', body: '' }]
      )
      setFooter(parsed.footer || '')
    } catch {
      // Plantilla vieja en HTML: se carga como cláusula única para no perder el texto
      setHeader('')
      setClauses([{ id: newClauseId(), title: 'Contenido del contrato (HTML original)', body: data.content || '' }])
      setFooter('')
    }

    setLoading(false)
  }, [isNew, templateId, supabase])

  useEffect(() => { load() }, [load])

  // Variables realmente usadas en el texto
  const usedVariables = useMemo(() => {
    const all = [header, footer, ...clauses.flatMap(c => [c.title, c.body])].join(' ')
    const found = all.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || []
    return [...new Set(found.map(v => v.replace(/[{}\s]/g, '')))]
  }, [header, footer, clauses])

  const contentJson = useMemo(
    () => JSON.stringify({
      isStructured: true,
      header,
      clauses: clauses.map(c => ({ id: c.id, title: c.title, body: c.body })),
      footer,
    }),
    [header, clauses, footer]
  )

  const previewHtml = useMemo(
    () => fillContractTemplate(contentJson, {
      nombre_cliente: 'Juan Pérez',
      dni_cliente: '20-12345678-9',
      domicilio_cliente: 'Av. Aconquija 1200, Yerba Buena',
      fecha_contrato: formatDate(new Date().toISOString()),
      fecha_inicio: formatDate(new Date().toISOString()),
      moneda: '$ ARS',
      monto_inicial: formatCurrency(1500000, 'ARS'),
      monto_letras: numberToWords(1500000).toUpperCase() + ' PESOS',
      tasa_mensual: '8.5',
      fecha_firma: formatDate(new Date().toISOString()),
      hora_firma: '12:00',
      ip_firma: '186.22.0.1',
    }, name || 'Plantilla sin nombre'),
    [contentJson, name]
  )

  const updateClause = (id: string, field: 'title' | 'body', value: string) => {
    setClauses(prev => prev.map(c => (c.id === id ? { ...c, [field]: value } : c)))
  }

  const addClause = () => {
    setClauses(prev => [...prev, { id: newClauseId(), title: '', body: '' }])
  }

  const removeClause = (id: string) => {
    setClauses(prev => (prev.length <= 1 ? prev : prev.filter(c => c.id !== id)))
  }

  const moveClause = (index: number, direction: -1 | 1) => {
    setClauses(prev => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy
    })
  }

  const copyVariable = (key: string) => {
    navigator.clipboard?.writeText(`{{${key}}}`)
    setStatus({ type: 'success', message: `Variable {{${key}}} copiada: pegala donde la necesites.` })
    setTimeout(() => setStatus(null), 2500)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      setStatus({ type: 'error', message: 'Poné un nombre a la plantilla.' })
      return
    }
    setSaving(true)
    setStatus(null)

    const payload = {
      name: name.trim(),
      type,
      content: contentJson,
      variables: usedVariables,
      is_active: isActive,
    }

    if (isNew) {
      const { data, error } = await supabase
        .from('contract_templates')
        .insert({ ...payload, version: 1 })
        .select('id')
        .single()

      setSaving(false)
      if (error) {
        setStatus({ type: 'error', message: 'No se pudo crear la plantilla: ' + error.message })
        return
      }
      router.replace(`/admin/contratos/plantillas/${data.id}`)
      setStatus({ type: 'success', message: 'Plantilla creada correctamente.' })
      return
    }

    const nextVersion = version + 1
    const { error } = await supabase
      .from('contract_templates')
      .update({ ...payload, version: nextVersion })
      .eq('id', templateId)

    setSaving(false)
    if (error) {
      setStatus({ type: 'error', message: 'No se pudo guardar: ' + error.message })
      return
    }
    setVersion(nextVersion)
    setStatus({ type: 'success', message: `Cambios guardados (versión ${nextVersion}).` })
    setTimeout(() => setStatus(null), 3000)
  }

  const handleDuplicate = async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from('contract_templates')
      .insert({
        name: `Copia de ${name}`,
        type,
        content: contentJson,
        variables: usedVariables,
        is_active: false,
        version: 1,
      })
      .select('id')
      .single()

    setSaving(false)
    if (error) {
      setStatus({ type: 'error', message: 'No se pudo duplicar: ' + error.message })
      return
    }
    router.push(`/admin/contratos/plantillas/${data.id}`)
  }

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar la plantilla "${name}"?\n\nLos contratos ya emitidos con ella no se borran: quedan sin plantilla asociada y conservan su PDF firmado.`)) return
    setDeleting(true)
    const { error } = await supabase.from('contract_templates').delete().eq('id', templateId)
    setDeleting(false)
    if (error) {
      setStatus({ type: 'error', message: 'No se pudo eliminar: ' + error.message })
      return
    }
    router.push('/admin/contratos?tab=plantillas')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground/40 mx-auto" />
        <h1 className="text-lg font-bold">No encontramos esa plantilla</h1>
        <p className="text-sm text-muted-foreground">Puede que haya sido eliminada.</p>
        <Link href="/admin/contratos" className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
          <ArrowLeft className="w-4 h-4" /> Volver a Contratos
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <Link
          href="/admin/contratos?tab=plantillas"
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5 self-start px-2')}
        >
          <ArrowLeft className="w-4 h-4" /> Contratos
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">
            {isNew ? 'Nueva Plantilla' : name || 'Plantilla'}
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            {isNew ? 'Definí el texto base de los contratos' : `Versión ${version} · ${usedVariables.length} variables en uso`}
          </p>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={saving} className="gap-1.5">
              <Copy className="w-3.5 h-3.5" /> Duplicar
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="gap-1.5 font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isNew ? 'Crear plantilla' : 'Guardar cambios'}
          </Button>
        </div>
      </div>

      {status && (
        <div
          className={cn(
            'p-3 rounded-xl border text-sm flex items-center gap-2',
            status.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          )}
        >
          {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Editor */}
        <div className="xl:col-span-3 space-y-6">
          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Datos de la plantilla
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Nombre</Label>
                  <Input
                    id="tpl-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Contrato de Inversión en Pesos"
                    className="bg-input/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-type">Tipo</Label>
                  <select
                    id="tpl-type"
                    value={type}
                    onChange={e => setType(e.target.value as TemplateType)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {TEMPLATE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-3 p-3 rounded-xl bg-accent/20 border border-border/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={e => setIsActive(e.target.checked)}
                  className="w-5 h-5 shrink-0 rounded border-border bg-input text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                />
                <span className="text-sm">
                  <span className="font-medium">Plantilla activa</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Solo las plantillas activas se ofrecen al generar contratos nuevos.
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Encabezado</CardTitle>
              <CardDescription className="text-xs">
                Texto de apertura, con las partes que firman el acuerdo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={header}
                onChange={e => setHeader(e.target.value)}
                rows={5}
                placeholder="Por un lado, el INVERSOR, Sr./Sra. {{nombre_cliente}}, CUIT {{dni_cliente}}..."
                className="bg-input/50 text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Cláusulas</CardTitle>
                  <CardDescription className="text-xs">{clauses.length} en total</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={addClause} className="gap-1.5 shrink-0">
                  <Plus className="w-3.5 h-3.5" /> Agregar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {clauses.map((clause, index) => (
                <div key={clause.id} className="p-3 rounded-xl border border-border/40 bg-accent/10 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-muted-foreground w-6 shrink-0">#{index + 1}</span>
                    <Input
                      value={clause.title}
                      onChange={e => updateClause(clause.id, 'title', e.target.value)}
                      placeholder="PRIMERA: Objeto del contrato"
                      className="bg-input/50 font-semibold text-sm"
                    />
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => moveClause(index, -1)}
                        disabled={index === 0}
                        title="Subir"
                        className="h-9 w-9 md:h-8 md:w-8 disabled:opacity-30"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => moveClause(index, 1)}
                        disabled={index === clauses.length - 1}
                        title="Bajar"
                        className="h-9 w-9 md:h-8 md:w-8 disabled:opacity-30"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => removeClause(clause.id)}
                        disabled={clauses.length <= 1}
                        title="Eliminar cláusula"
                        className="h-9 w-9 md:h-8 md:w-8 text-red-400 hover:bg-red-500/10 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={clause.body}
                    onChange={e => updateClause(clause.id, 'body', e.target.value)}
                    rows={4}
                    placeholder="Redactá el contenido de la cláusula..."
                    className="bg-input/50 text-sm leading-relaxed"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Pie del contrato</CardTitle>
              <CardDescription className="text-xs">
                Cierre, lugar y constancia de la firma electrónica.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={footer}
                onChange={e => setFooter(e.target.value)}
                rows={4}
                placeholder="En prueba de conformidad, se firma electrónicamente el {{fecha_firma}} a las {{hora_firma}} desde la IP {{ip_firma}}."
                className="bg-input/50 text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          {!isNew && (
            <Card className="border border-red-500/20 bg-red-500/5">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-300">Eliminar plantilla</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Los contratos ya firmados con esta plantilla conservan su PDF y quedan intactos.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1.5 shrink-0"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Eliminar
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Variables + vista previa */}
        <div className="xl:col-span-2 space-y-6">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Variables disponibles</CardTitle>
              <CardDescription className="text-xs">
                Tocá una para copiarla y pegarla en el texto. Se reemplazan al generar el contrato.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map(v => {
                const used = usedVariables.includes(v.key)
                return (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => copyVariable(v.key)}
                    title={v.label}
                    className={cn(
                      'px-2 py-1.5 rounded-lg border text-[11px] font-mono transition-colors',
                      used
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'bg-accent/30 border-border/40 text-muted-foreground hover:bg-accent/60'
                    )}
                  >
                    {'{{' + v.key + '}}'}
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card className="glass-card xl:sticky xl:top-20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" /> Vista previa
              </CardTitle>
              <CardDescription className="text-xs">Con datos de ejemplo</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border/40 bg-slate-950/40">
                <div
                  className="text-[11px] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline" className="text-[10px]">
                  {TEMPLATE_TYPES.find(t => t.value === type)?.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn('text-[10px]', isActive
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30')}
                >
                  {isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
