'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Contract } from '@/lib/types'
import { formatDate } from '@/lib/helpers'
import { FileText, Download, ExternalLink } from 'lucide-react'

export default function PortalDocumentosPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase.from('contracts').select('*').eq('client_id', user.id).order('created_at', { ascending: false })
      .then(({ data }: { data: any }) => { setContracts(data || []); setLoading(false) })
  }, [user])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" /></div>

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="text-center pt-2">
        <h1 className="text-xl font-bold">Documentos</h1>
        <p className="text-muted-foreground text-xs mt-1">Contratos y comprobantes</p>
      </div>

      {contracts.length === 0 ? (
        <Card className="glass-card"><CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm">Sin documentos disponibles</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract, i) => (
            <Card key={contract.id} className="glass-card animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Contrato de Inversión</p>
                    <p className="text-xs text-muted-foreground">
                      {contract.currency} · {formatDate(contract.start_date)} — {formatDate(contract.end_date)}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">Estado: {contract.status}</p>
                  </div>
                  {contract.contract_url ? (
                    <a href={contract.contract_url} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 h-9 w-9 p-0">
                        <Download className="w-4 h-4" />
                      </Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="ghost" disabled className="h-9 w-9 p-0 text-muted-foreground/30">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-center pt-4">
        <p className="text-[10px] text-muted-foreground/50">
          Los documentos son generados automáticamente por FinanPre.
          <br />Contactá a tu asesor para solicitar comprobantes adicionales.
        </p>
      </div>
    </div>
  )
}
