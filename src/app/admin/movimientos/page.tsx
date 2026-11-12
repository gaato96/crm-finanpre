'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/helpers'
import { LEDGER_CONCEPT_LABELS, type LedgerEntry, type LedgerConcept, type Currency } from '@/lib/types'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Loader2,
  RefreshCw,
  Download,
  AlertTriangle,
} from 'lucide-react'

type RangeKey = 'mes' | 'trimestre' | 'anio' | 'todo'

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: 'mes', label: 'Últimos 30 días', days: 30 },
  { key: 'trimestre', label: 'Últimos 90 días', days: 90 },
  { key: 'anio', label: 'Último año', days: 365 },
  { key: 'todo', label: 'Todo', days: null },
]

/**
 * Libro mayor de movimientos.
 *
 * El sistema no registraba el dinero que entraba y salía: confirmar un retiro
 * sólo cambiaba un estado, así que no había forma de auditar un período ni de
 * cerrar un mes. Las RPC de la v15 asientan cada operación acá.
 */
export default function MovimientosPage() {
  const supabase = createClient()
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('mes')
  const [concept, setConcept] = useState<LedgerConcept | 'todos'>('todos')

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('ledger_entries')
      .select('*, profiles:client_id(full_name)')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)

    const days = RANGES.find((r) => r.key === range)?.days
    if (days) {
      const from = new Date()
      from.setDate(from.getDate() - days)
      query = query.gte('entry_date', from.toISOString().split('T')[0])
    }
    if (concept !== 'todos') query = query.eq('concept', concept)

    const { data, error: queryError } = await query

    if (queryError) {
      setError('No se pudieron cargar los movimientos: ' + queryError.message)
      setLoading(false)
      return
    }

    setEntries((data ?? []) as LedgerEntry[])
    setLoading(false)
  }, [supabase, range, concept])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // Los totales se separan por moneda: sumar pesos con dólares no significa nada
  const totals = useMemo(() => {
    const acc: Record<Currency, { in: number; out: number }> = {
      ARS: { in: 0, out: 0 },
      USD: { in: 0, out: 0 },
    }
    for (const e of entries) {
      const bucket = acc[e.currency] ?? acc.ARS
      if (e.direction === 'in') bucket.in += Number(e.amount)
      else bucket.out += Number(e.amount)
    }
    return acc
  }, [entries])

  const exportCsv = () => {
    const header = ['Fecha', 'Tipo', 'Concepto', 'Cliente', 'Moneda', 'Monto', 'Notas']
    const rows = entries.map((e) => [
      e.entry_date,
      e.direction === 'in' ? 'Ingreso' : 'Egreso',
      LEDGER_CONCEPT_LABELS[e.concept] ?? e.concept,
      e.profiles?.full_name ?? '',
      e.currency,
      String(e.amount),
      (e.notes ?? '').replace(/"/g, '""'),
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${cell}"`).join(';'))
      .join('\n')

    // BOM para que Excel en español abra los acentos bien
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rendimax-movimientos-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl lg:text-3xl font-bold">Movimientos</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Libro mayor de ingresos y egresos de la operación
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchEntries} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={entries.length === 0}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Totales del período, por moneda */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(['ARS', 'USD'] as Currency[]).map((currency) => {
          const t = totals[currency]
          const net = t.in - t.out
          if (t.in === 0 && t.out === 0) return null
          return (
            <Card key={currency} className="glass-card">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Saldo del período
                  </p>
                  <Badge variant="outline" className="text-[10px]">{currency}</Badge>
                </div>
                <p className={`text-2xl font-bold ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(net, currency)}
                </p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="text-emerald-400/80 flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3" /> {formatCurrency(t.in, currency)}
                  </span>
                  <span className="text-red-400/80 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> {formatCurrency(t.out, currency)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              range === r.key
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            {r.label}
          </button>
        ))}

        <select
          value={concept}
          onChange={(e) => setConcept(e.target.value as LedgerConcept | 'todos')}
          className="ml-auto h-8 px-2 rounded-lg border border-border bg-input/50 text-xs text-foreground"
        >
          <option value="todos">Todos los conceptos</option>
          {(Object.keys(LEDGER_CONCEPT_LABELS) as LedgerConcept[]).map((c) => (
            <option key={c} value={c}>
              {LEDGER_CONCEPT_LABELS[c]}
            </option>
          ))}
        </select>
      </div>

      <Card className="glass-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : entries.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
              <p className="text-sm">Sin movimientos en este período</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                Los asientos se generan al acreditar fondos, cobrar cuotas y confirmar retiros.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Concepto</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => {
                    const isIn = e.direction === 'in'
                    return (
                      <TableRow key={e.id} className="border-border/30">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(e.entry_date)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className={`p-1 rounded ${isIn ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}
                            >
                              {isIn ? (
                                <ArrowDownLeft className="w-3 h-3" />
                              ) : (
                                <ArrowUpRight className="w-3 h-3" />
                              )}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {LEDGER_CONCEPT_LABELS[e.concept] ?? e.concept}
                              </p>
                              {e.notes && (
                                <p className="text-[11px] text-muted-foreground truncate">{e.notes}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground truncate max-w-[180px]">
                          {e.profiles?.full_name ?? '—'}
                        </TableCell>
                        <TableCell
                          className={`text-right text-sm font-semibold whitespace-nowrap ${isIn ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {isIn ? '+' : '−'} {formatCurrency(Number(e.amount), e.currency)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {entries.length === 500 && (
        <p className="text-xs text-muted-foreground text-center">
          Se muestran los 500 movimientos más recientes. Acotá el período para ver el resto.
        </p>
      )}
    </div>
  )
}
