'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ContractPdfButton } from '@/components/ContractPdfButton'
import type { Contract } from '@/lib/types'
import { formatCurrency, formatDate, getContractStatusLabel, getContractStatusColor } from '@/lib/helpers'
import { FileText, Clock, ShieldCheck } from 'lucide-react'

export default function PortalDocumentosPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    // Sólo contratos de inversión: los créditos tienen su propia fila en
    // `contracts` y no son documentos del inversor.
    supabase
      .from('contracts')
      .select('*')
      .eq('client_id', user.id)
      .eq('kind', 'inversion')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: any }) => {
        setContracts(data || [])
        setLoading(false)
      })
  }, [user])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const signed = contracts.filter((c) => c.contract_signed_at)
  const pending = contracts.filter((c) => !c.contract_signed_at)

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="text-center pt-2">
        <h1 className="text-xl font-bold">Documentos</h1>
        <p className="text-muted-foreground text-xs mt-1">
          {signed.length > 0
            ? `${signed.length} contrato${signed.length > 1 ? 's' : ''} firmado${signed.length > 1 ? 's' : ''}`
            : 'Contratos y comprobantes'}
        </p>
      </div>

      {contracts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm">Sin documentos disponibles</p>
            <p className="text-xs mt-1 text-muted-foreground/60">
              Cuando firmes tu primera inversión, el contrato aparece acá.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...signed, ...pending].map((contract, i) => {
            const isSigned = Boolean(contract.contract_signed_at)
            return (
              <Card
                key={contract.id}
                className="glass-card animate-fade-in"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isSigned ? 'bg-primary/10' : 'bg-amber-500/10'
                      }`}
                    >
                      {isSigned ? (
                        <FileText className="w-5 h-5 text-primary" />
                      ) : (
                        <Clock className="w-5 h-5 text-amber-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">
                          Contrato de Inversión ·{' '}
                          {formatCurrency(Number(contract.initial_capital), contract.currency)}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${getContractStatusColor(contract.status)}`}
                        >
                          {getContractStatusLabel(contract.status)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(contract.start_date)} — {formatDate(contract.end_date)}
                      </p>
                      {isSigned && (
                        <p className="text-[10px] text-emerald-400/80 mt-1 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                          Firmado el {formatDate(contract.contract_signed_at)}
                        </p>
                      )}
                    </div>

                    {/*
                      Acá estaba el bug: el botón leía `contract_url`, una columna
                      del schema original que nunca se escribió. El PDF firmado
                      vive en Storage, así que la descarga estaba deshabilitada
                      para absolutamente todos los inversores.
                    */}
                    {isSigned ? (
                      <ContractPdfButton
                        contractId={contract.id}
                        iconOnly
                        className="h-9 w-9 p-0 border-primary/30 text-primary hover:bg-primary/10"
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50 shrink-0 text-right leading-tight">
                        Pendiente
                        <br />
                        de firma
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <div className="text-center pt-4">
        <p className="text-[10px] text-muted-foreground/50">
          Los enlaces de descarga son personales y vencen en una hora.
          <br />
          Contactá a tu asesor para solicitar comprobantes adicionales.
        </p>
      </div>
    </div>
  )
}
