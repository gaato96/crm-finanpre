'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Save,
  Code,
  BookTemplate,
  Plus,
  Play,
  Copy,
  Info,
  CheckCircle,
  Trash2,
  Sparkles,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'
import type { ContractTemplate, TemplateType } from '@/lib/types'

const AVAILABLE_VARIABLES = [
  { placeholder: '{{fecha_contrato}}', desc: 'Fecha de creación del contrato' },
  { placeholder: '{{nombre_cliente}}', desc: 'Nombre completo del cliente' },
  { placeholder: '{{dni_cliente}}', desc: 'DNI / Documento del cliente' },
  { placeholder: '{{domicilio_cliente}}', desc: 'Dirección o domicilio del cliente' },
  { placeholder: '{{moneda}}', desc: 'Símbolo de la moneda (ARS / USD)' },
  { placeholder: '{{monto_inicial}}', desc: 'Monto de capital aportado' },
  { placeholder: '{{monto_letras}}', desc: 'Monto de capital escrito en letras' },
  { placeholder: '{{tasa_mensual}}', desc: 'Tasa de interés mensual pactada' },
  { placeholder: '{{fecha_inicio}}', desc: 'Fecha de inicio del contrato' },
  { placeholder: '{{fecha_firma}}', desc: 'Fecha en que se firmó el contrato' },
  { placeholder: '{{hora_firma}}', desc: 'Hora exacta de la firma' },
  { placeholder: '{{ip_firma}}', desc: 'Dirección IP desde donde se firmó' },
]

export default function TemplateEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const isNew = id === 'nueva'
  const supabase = createClient()

  // Form states
  const [name, setName] = useState('')
  const [type, setType] = useState<TemplateType>('inversion')
  const [content, setContent] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [version, setVersion] = useState(1)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [editorMode, setEditorMode] = useState<'structured' | 'html'>('structured')

  // Structured Editor States
  const lastFocusedRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [clauses, setClauses] = useState<{ id: string; title: string; body: string }[]>([])

  // Load existing template data or defaults
  useEffect(() => {
    if (isNew) {
      setName('Nuevo Contrato de Inversión')
      setHeader('Por un lado, el INVERSOR, Sr./Sra. {{nombre_cliente}}, DNI {{dni_cliente}}, con domicilio en {{domicilio_cliente}}.\nY por el otro, la FINANCIERA, FinanPre, con domicilio legal en CABA, Argentina.')
      setClauses([
        {
          id: '1',
          title: 'PRIMERA: Objeto de la Inversión',
          body: 'El INVERSOR aporta la suma de {{moneda}} {{monto_inicial}} (monto en letras: {{monto_letras}}) en concepto de capital de inversión.\nSobre dicho capital se aplicará una tasa de interés mensual del {{tasa_mensual}}%, que se capitalizará de forma mensual (interés compuesto) de acuerdo a lo pactado.'
        },
        {
          id: '2',
          title: 'SEGUNDA: Plazo y Liquidación',
          body: 'El plazo establecido de la inversión inicia el {{fecha_inicio}}. Las ganancias de interés se acumularán al capital inicial de forma compuesta cada 30 días.\nEl INVERSOR podrá solicitar el retiro de su capital e intereses en cualquier momento desde su panel de usuario. FinanPre transferirá los fondos en un plazo no mayor a 48 horas hábiles.'
        },
        {
          id: '3',
          title: 'TERCERA: Marco Legal de Firma',
          body: 'Las partes acuerdan y aceptan que la firma digital/electrónica provista en este acto goza de plena validez jurídica y probatoria bajo el marco regulatorio de la Ley 25.506 de Firma Digital en la República Argentina.'
        }
      ])
      setFooter('En conformidad, firman las partes en la fecha {{fecha_firma}}.')
      setEditorMode('structured')
      setLoading(false)
      return
    }

    const fetchTemplate = async () => {
      const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        alert('No se pudo encontrar la plantilla especificada.')
        router.push('/admin/contratos')
        return
      }

      setName(data.name)
      setType(data.type)
      setIsActive(data.is_active)
      setVersion(data.version)

      try {
        const parsed = JSON.parse(data.content)
        if (parsed && parsed.isStructured) {
          setHeader(parsed.header || '')
          setClauses(parsed.clauses || [])
          setFooter(parsed.footer || '')
          // structured mode
        } else {
          // Legacy HTML content: parse as single clause
          setHeader('')
          setClauses([{ id: '1', title: 'Contenido del Contrato', body: data.content }])
          setFooter('')
        }
      } catch (e) {
        setClauses([{ id: '1', title: 'Contenido del Contrato', body: data.content }])
      }

      setLoading(false)
    }

    fetchTemplate()
  }, [id, isNew, router, supabase])

  // Track last focused editable element
  const handleFieldFocus = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    lastFocusedRef.current = e.target
  }, [])

  // Insert variable helper using tracked ref
  const insertVariable = (variable: string) => {
    const el = lastFocusedRef.current
    if (!el) {
      // Default: append to first clause body if exists, or header
      if (clauses.length > 0) {
        setClauses(prev => prev.map((c, i) => i === 0 ? { ...c, body: c.body + variable } : c))
      } else {
        setHeader(prev => prev + variable)
      }
      return
    }

    const startPos = el.selectionStart ?? el.value.length
    const endPos = el.selectionEnd ?? el.value.length
    const currentText = el.value

    const newText =
      currentText.substring(0, startPos) +
      variable +
      currentText.substring(endPos, currentText.length)

    const elementId = el.id
    if (elementId === 'header') {
      setHeader(newText)
    } else if (elementId === 'footer') {
      setFooter(newText)
    } else if (elementId.startsWith('clause-body-')) {
      const cid = elementId.replace('clause-body-', '')
      setClauses(prev => prev.map(c => c.id === cid ? { ...c, body: newText } : c))
    } else if (elementId.startsWith('clause-title-')) {
      const cid = elementId.replace('clause-title-', '')
      setClauses(prev => prev.map(c => c.id === cid ? { ...c, title: newText } : c))
    }

    setTimeout(() => {
      el.focus()
      el.selectionStart = startPos + variable.length
      el.selectionEnd = startPos + variable.length
    }, 10)
  }

  // Dynamic clauses actions
  const addClause = () => {
    const nextNum = clauses.length + 1
    const titles = ['PRIMERA', 'SEGUNDA', 'TERCERA', 'CUARTA', 'QUINTA', 'SEXTA', 'SÉPTIMA', 'OCTAVA', 'NOVENA', 'DÉCIMA']
    const label = titles[nextNum - 1] ? `${titles[nextNum - 1]}: Objeto` : `${nextNum}º Cláusula`

    setClauses([
      ...clauses,
      { id: Math.random().toString(36).slice(2, 9), title: label, body: '' }
    ])
  }

  const updateClause = (cid: string, field: 'title' | 'body', val: string) => {
    setClauses(prev => prev.map(c => c.id === cid ? { ...c, [field]: val } : c))
  }

  const removeClause = (cid: string) => {
    setClauses(prev => prev.filter(c => c.id !== cid))
  }

  // Handle Save template
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return

    setSaving(true)

    const structuredData = {
      isStructured: true,
      header,
      clauses,
      footer,
    }
    const finalContent = JSON.stringify(structuredData)
    
    const allText = `${header} ${footer} ${clauses.map(c => `${c.title} ${c.body}`).join(' ')}`
    const usedVariables = AVAILABLE_VARIABLES.filter((v) =>
      allText.includes(v.placeholder)
    ).map((v) => v.placeholder.replace('{{', '').replace('}}', ''))

    try {
      if (isNew) {
        const { error } = await supabase.from('contract_templates').insert({
          name,
          type,
          content: finalContent,
          is_active: isActive,
          version: 1,
          variables: usedVariables,
        })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('contract_templates')
          .update({
            name,
            type,
            content: finalContent,
            is_active: isActive,
            version: version + 1,
            variables: usedVariables,
          })
          .eq('id', id)
        if (error) throw error
      }

      router.push('/admin/contratos')
    } catch (err: any) {
      console.error(err)
      alert('Error al guardar la plantilla: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Render mock variables HTML preview
  const previewHtml = () => {
    let preview = ''
    if (editorMode === 'structured') {
      preview = `
        <div class="contract-preview p-6 text-slate-300 font-sans leading-relaxed space-y-6">
          <div class="text-center border-b border-slate-800 pb-6 mb-6">
            <h1 class="text-xl font-bold tracking-wider text-emerald-400">${name.toUpperCase() || 'CONTRATO'}</h1>
            <p class="text-xs text-slate-500 mt-1">FinanPre · Plataforma de Inversiones</p>
          </div>
          <div class="space-y-4 text-sm">
            <p class="mb-4 whitespace-pre-line">${header}</p>
            ${clauses.map((c) => `
              <div class="clause mb-4">
                <h3 class="font-bold text-slate-200 border-b border-slate-800/50 pb-1 mb-2">${c.title || 'Título de Cláusula'}</h3>
                <p class="whitespace-pre-line text-slate-300">${c.body || 'Cuerpo de la cláusula...'}</p>
              </div>
            `).join('')}
            <p class="mt-6 pt-4 border-t border-slate-800 whitespace-pre-line">${footer}</p>
          </div>
        </div>
      `
    } else {
      preview = content
    }

    const mockVals: Record<string, string> = {
      fecha_contrato: new Date().toLocaleDateString('es-AR'),
      nombre_cliente: 'Juan Carlos Gómez',
      dni_cliente: '20.450.980',
      domicilio_cliente: 'Av. del Libertador 4560, CABA',
      moneda: type === 'inversion' ? '$ ARS' : '$ USD',
      monto_inicial: '1,500,000.00',
      monto_letras: 'un millón quinientos mil',
      tasa_mensual: '4.5',
      fecha_inicio: new Date().toLocaleDateString('es-AR'),
      fecha_firma: new Date().toLocaleDateString('es-AR'),
      hora_firma: new Date().toLocaleTimeString('es-AR'),
      ip_firma: '192.168.1.45',
    }

    for (const [k, v] of Object.entries(mockVals)) {
      preview = preview.replaceAll(`{{${k}}}`, `<span class="bg-emerald-500/20 text-emerald-300 px-1 rounded font-semibold border border-emerald-500/30">${v}</span>`)
    }

    return preview || '<p class="text-muted-foreground text-center italic py-12">El documento se previsualizará aquí</p>'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/contratos" className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Contratos
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{isNew ? 'Nueva Plantilla' : 'Editar Plantilla'}</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isNew
              ? 'Creá una nueva plantilla de contrato con el editor visual'
              : `Modificando: ${name} (versión actual: v${version})`}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left column: editor fields */}
        <div className="xl:col-span-3 space-y-6">
          <Card className="glass-card">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-base flex items-center gap-2">
                <BookTemplate className="w-4 h-4 text-primary" /> Configuración Básica
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nombre de la plantilla</Label>
                  <Input
                    required
                    placeholder="Contrato de Inversión Tradicional"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-input/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo de Contrato</Label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as TemplateType)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-input/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="inversion">📈 Inversión</option>
                    <option value="credito">💳 Crédito</option>
                    <option value="servicio">🤝 Contrato de Servicio</option>
                    <option value="otro">📄 Otro</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-accent/30 border border-border/40">
                <div className="space-y-0.5">
                  <Label className="text-sm font-semibold">Estado de la plantilla</Label>
                  <p className="text-xs text-muted-foreground">
                    Solo las plantillas activas pueden seleccionarse al crear nuevos contratos
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-500 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-slate-950"></div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Template Content Editor */}
          <Card className="glass-card">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Redacción de Cláusulas y Términos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
                <div className="space-y-6">
                  <div className="flex gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Redactá las cláusulas del contrato en texto plano. Usá las <strong>Variables Dinámicas</strong> del panel derecho para insertar automáticamente datos del cliente, montos y fechas.
                    </p>
                  </div>

                  {/* Header Text */}
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Introducción del Contrato (Encabezado)
                    </Label>
                    <textarea
                      id="header"
                      placeholder="Ej: En la fecha {{fecha_contrato}} se celebra el presente acuerdo..."
                      value={header}
                      onChange={(e) => setHeader(e.target.value)}
                      onFocus={handleFieldFocus}
                      className="w-full min-h-[110px] p-3 rounded-lg border border-border bg-slate-950/80 font-sans text-sm leading-relaxed text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {/* Clauses List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                        Cláusulas Pactadas
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addClause}
                        className="h-7 px-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Agregar Cláusula
                      </Button>
                    </div>

                    {clauses.length === 0 ? (
                      <div className="text-center py-8 border border-dashed border-border/40 rounded-xl text-muted-foreground text-xs">
                        No hay cláusulas definidas. Hacé clic en "Agregar Cláusula" para empezar.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {clauses.map((clause, idx) => (
                          <div key={clause.id} className="p-3.5 rounded-xl border border-border bg-slate-900/40 space-y-3 relative group">
                            <div className="flex items-center justify-between gap-3">
                              <input
                                id={`clause-title-${clause.id}`}
                                placeholder={`Ej: ${idx + 1}º Cláusula`}
                                value={clause.title}
                                onChange={(e) => updateClause(clause.id, 'title', e.target.value)}
                                onFocus={handleFieldFocus}
                                className="flex-1 h-9 px-3 rounded-md border border-border bg-slate-950 font-semibold text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => removeClause(clause.id)}
                                className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <textarea
                              id={`clause-body-${clause.id}`}
                              placeholder="Redactá el cuerpo de la cláusula..."
                              value={clause.body}
                              onChange={(e) => updateClause(clause.id, 'body', e.target.value)}
                              onFocus={handleFieldFocus}
                              className="w-full min-h-[100px] p-3 rounded-md border border-border bg-slate-950 text-xs leading-relaxed text-slate-300 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer Text */}
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Cierre del Contrato (Pie de Página)
                    </Label>
                    <textarea
                      id="footer"
                      placeholder="Ej: En conformidad, firman las partes..."
                      value={footer}
                      onChange={(e) => setFooter(e.target.value)}
                      onFocus={handleFieldFocus}
                      className="w-full min-h-[90px] p-3 rounded-lg border border-border bg-slate-950/80 font-sans text-sm leading-relaxed text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </div>

              <Button
                type="submit"
                disabled={saving}
                className="w-full h-11 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-all gap-2 mt-4"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" /> Guardando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 text-slate-950" />
                    {isNew ? 'Crear Plantilla' : 'Guardar Cambios'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column: variables and preview */}
        <div className="xl:col-span-2 space-y-6">
          {/* Variables Catalog */}
          <Card className="glass-card">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Variables Dinámicas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 max-h-[300px] overflow-y-auto space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                Hace clic en cualquier variable para insertarla en la posición actual del cursor en el campo que estés editando.
              </p>
              {AVAILABLE_VARIABLES.map((v) => (
                <div
                  key={v.placeholder}
                  onClick={() => insertVariable(v.placeholder)}
                  className="group flex items-center justify-between p-2.5 rounded-lg border border-border/40 hover:border-primary/40 bg-accent/20 hover:bg-primary/5 cursor-pointer transition-all"
                >
                  <code className="text-xs font-semibold text-primary group-hover:text-emerald-400">
                    {v.placeholder}
                  </code>
                  <span className="text-[10px] text-muted-foreground text-right max-w-[160px] truncate">
                    {v.desc}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Live Preview */}
          <Card className="glass-card">
            <CardHeader className="pb-3 border-b border-border/30 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Play className="w-4 h-4 text-primary" /> Vista Previa del Documento
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="rounded-xl border border-border/50 bg-slate-950 max-h-[460px] overflow-y-auto p-6 text-sm text-slate-300 font-sans leading-relaxed shadow-inner">
                <div
                  className="contract-content-preview"
                  dangerouslySetInnerHTML={{ __html: previewHtml() }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  )
}
