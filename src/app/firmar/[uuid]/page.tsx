'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Download,
  PenTool,
  ShieldCheck,
  Lock,
} from 'lucide-react'
import {
  fillContractTemplate,
  formatCurrency,
  formatDate,
  numberToWords,
  generateSHA256,
} from '@/lib/helpers'
import type { Contract, Profile, ContractTemplate } from '@/lib/types'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'
import SignatureCanvas from 'react-signature-canvas'

// Fallback HTML template in case the DB one is not loaded yet
const DEFAULT_HTML_TEMPLATE = `
<div class="contract-preview p-6 text-slate-300 font-sans leading-relaxed space-y-6">
  <div class="text-center border-b border-slate-800 pb-6">
    <h1 class="text-xl font-bold tracking-wider text-emerald-400">CONTRATO DE INVERSIÓN DIGITAL</h1>
    <p class="text-xs text-slate-500 mt-1">FinanPre · Plataforma de Inversiones</p>
  </div>
  
  <div class="space-y-4 text-sm">
    <p><strong>Fecha del Contrato:</strong> {{fecha_contrato}}</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">1. LAS PARTES</h2>
    <p>Por un lado, el <strong>INVERSOR</strong>, Sr./Sra. <strong>{{nombre_cliente}}</strong>, DNI <strong>{{dni_cliente}}</strong>, con domicilio en <strong>{{domicilio_cliente}}</strong>.</p>
    <p>Y por el otro, la <strong>FINANCIERA</strong>, <strong>FinanPre</strong>, con domicilio legal en CABA, Argentina.</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">2. OBJETO DE LA INVERSIÓN</h2>
    <p>El INVERSOR aporta la suma de <strong>{{moneda}} {{monto_inicial}}</strong> (monto en letras: <em>{{monto_letras}}</em>) en concepto de capital de inversión.</p>
    <p>Sobre dicho capital se aplicará una tasa de interés mensual del <strong>{{tasa_mensual}}%</strong>, que se capitalizará de forma mensual (interés compuesto) de acuerdo a lo pactado.</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">3. PLAZO Y LIQUIDACIÓN</h2>
    <p>El plazo establecido de la inversión inicia el <strong>{{fecha_inicio}}</strong>. Las ganancias de interés se acumularán al capital inicial de forma compuesta cada 30 días.</p>
    <p>El INVERSOR podrá solicitar el retiro de su capital e intereses en cualquier momento desde su panel de usuario. FinanPre transferirá los fondos en un plazo no mayor a 48 horas hábiles.</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">4. MARCO LEGAL DE FIRMA ELECTRÓNICA</h2>
    <p>Las partes acuerdan y aceptan que la firma digital/electrónica provista en este acto goza de plena validez jurídica y probatoria bajo el marco regulatorio de la Ley 25.506 de Firma Digital en la República Argentina. Ambas partes renuncian a impugnar el documento por el solo hecho de haberse formalizado por medios electrónicos.</p>
    
    <div class="border-t border-slate-800 pt-6 mt-8 space-y-2 text-xs text-slate-500 bg-slate-950/30 p-4 rounded-xl">
      <p>🛡️ <strong>Información de Seguridad y Firma Electrónica:</strong></p>
      <ul class="list-disc pl-5 space-y-1">
        <li><strong>Firmante:</strong> {{nombre_cliente}} (DNI: {{dni_cliente}})</li>
        <li><strong>Fecha de firma:</strong> {{fecha_firma}} a las {{hora_firma}}</li>
        <li><strong>Dirección IP:</strong> {{ip_firma}}</li>
      </ul>
    </div>
  </div>
</div>
`

export default function PublicSigningPage() {
  const params = useParams()
  const uuid = params.uuid as string
  const supabase = createClient()

  // States
  const [contract, setContract] = useState<(Contract & { profiles: Profile }) | null>(null)
  const [template, setTemplate] = useState<ContractTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [ip, setIp] = useState('Obteniendo IP...')

  // Verification checkboxes
  const [checkRead, setCheckRead] = useState(false)
  const [checkLegal, setCheckLegal] = useState(false)

  // Signing & Submission states
  const [signing, setSigning] = useState(false)
  const [signSuccess, setSignSuccess] = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)
  const [hash, setHash] = useState('')

  const sigCanvasRef = useRef<any>(null)
  const contractPrintRef = useRef<HTMLDivElement>(null)

  // Initialize mounting and fetch client IP
  useEffect(() => {
    setMounted(true)
    const getIp = async () => {
      try {
        const res = await fetch('https://api.ipify.org?format=json')
        const data = await res.json()
        setIp(data.ip)
      } catch (err) {
        setIp('IP indeterminada')
      }
    }
    getIp()
  }, [])

  // Fetch contract and template
  useEffect(() => {
    if (!uuid) return

    const fetchContract = async () => {
      try {
        setLoading(true)
        setErrorMsg(null)

        // Fetch contract by sign_token
        const { data: contractData, error: contractErr } = await supabase
          .from('contracts')
          .select('*, profiles(*)')
          .eq('sign_token', uuid)
          .single()

        if (contractErr || !contractData) {
          setErrorMsg('El enlace de firma no es válido o ha expirado. Comprobá el link e intentá nuevamente.')
          setLoading(false)
          return
        }

        setContract(contractData as Contract & { profiles: Profile })

        // Fetch specific contract template or fallback
        let templateData = null

        if (contractData.template_id) {
          const { data } = await supabase
            .from('contract_templates')
            .select('*')
            .eq('id', contractData.template_id)
            .single()
          templateData = data
        }

        if (!templateData) {
          // Check if linked to a credit
          const { data: creditLink } = await supabase
            .from('credits')
            .select('id')
            .eq('contract_id', contractData.id)
            .maybeSingle()
          
          const fallbackType = creditLink ? 'credito' : 'inversion'

          const { data } = await supabase
            .from('contract_templates')
            .select('*')
            .eq('type', fallbackType)
            .eq('is_active', true)
            .order('version', { ascending: false })
            .limit(1)
            .single()
          templateData = data
        }

        if (templateData) {
          setTemplate(templateData as ContractTemplate)
        }
      } catch (err: any) {
        console.error('Error fetching contract:', err)
        setErrorMsg('Ocurrió un error al cargar el contrato. Por favor, recargá la página.')
      } finally {
        setLoading(false)
      }
    }

    fetchContract()
  }, [uuid])

  // Clear signature canvas
  const handleClear = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear()
    }
  }

  // Handle signature submit
  const handleSign = async () => {
    if (!contract || !mounted) return
    if (sigCanvasRef.current.isEmpty()) {
      alert('Por favor, dibuje su firma en el recuadro antes de continuar.')
      return
    }

    setSigning(true)

    try {
      // 1. Fill template HTML with variables
      const rawHtml = template?.content || DEFAULT_HTML_TEMPLATE
      const today = new Date()
      const variables = {
        fecha_contrato: formatDate(contract.created_at),
        nombre_cliente: contract.profiles?.full_name || '',
        dni_cliente: contract.profiles?.dni || '',
        domicilio_cliente: contract.profiles?.address || 'No registrado',
        moneda: contract.currency === 'ARS' ? '$ ARS' : '$ USD',
        monto_inicial: formatCurrency(contract.initial_capital, contract.currency),
        monto_letras: numberToWords(contract.initial_capital) + ' ' + (contract.currency === 'ARS' ? 'pesos' : 'dólares'),
        tasa_mensual: contract.monthly_rate.toString(),
        fecha_inicio: formatDate(contract.start_date),
        fecha_firma: formatDate(today.toISOString()),
        hora_firma: today.toLocaleTimeString('es-AR'),
        ip_firma: ip,
      }

      const filledHtml = fillContractTemplate(rawHtml, variables, template?.name || 'Contrato')
      const documentHash = await generateSHA256(filledHtml)
      setHash(documentHash)

      // 2. Add signature image to the document preview dynamically for PDF generation
      const signatureImgData = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png')
      
      // Update DOM temporarily to render signature
      const printContainer = contractPrintRef.current
      if (!printContainer) throw new Error('Contenedor de impresión no encontrado')

      // 3. Generate PDF using html2canvas-pro & jsPDF
      const canvas = await html2canvas(printContainer, {
        scale: 2,
        backgroundColor: '#0f172a',
        useCORS: true,
        logging: false,
      })

      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error('El canvas de impresión tiene dimensiones inválidas o vacías.')
      }
      
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210
      const pageHeight = 295
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0

      // Add main document print
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      let pageCount = 1
      while (heightLeft > 0 && pageCount < 20) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
        pageCount++
      }

      // Add signature block at the end if not already visible
      pdf.addPage()
      pdf.setFontSize(14)
      pdf.setTextColor(16, 185, 129) // emerald-500
      pdf.text('FIRMA ELECTRÓNICA REGISTRADA', 20, 30)
      pdf.setFontSize(10)
      pdf.setTextColor(156, 163, 175) // gray-400
      pdf.text(`Firmante: ${contract.profiles?.full_name || 'Nombre no registrado'}`, 20, 45)
      pdf.text(`DNI: ${contract.profiles?.dni || 'DNI no registrado'}`, 20, 52)
      pdf.text(`Fecha y Hora: ${formatDate(today.toISOString())} - ${today.toLocaleTimeString('es-AR')}`, 20, 59)
      pdf.text(`Dirección IP: ${ip}`, 20, 66)
      pdf.text(`Hash de Integridad (SHA-256): ${documentHash}`, 20, 73)
      
      // Draw signature image
      pdf.text('Firma digital autógrafa:', 20, 85)
      pdf.addImage(signatureImgData, 'PNG', 20, 90, 80, 40)

      const pdfBlob = pdf.output('blob')
      const fileName = `${contract.id}_signed.pdf`

      // 4. Upload PDF to Storage
      const { error: uploadErr } = await supabase.storage
        .from('contracts')
        .upload(fileName, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadErr) {
        console.error('Storage Upload Error:', uploadErr)
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('contracts')
        .getPublicUrl(fileName)

      setSignedPdfUrl(publicUrl)

      // 5. Update Contract in Database
      const { error: updateErr } = await supabase
        .from('contracts')
        .update({
          status: contract.asset_id ? 'en_consignacion' : 'pendiente_fondos',
          contract_signed_at: today.toISOString(),
          signer_ip: ip,
          contract_hash: documentHash,
          contract_pdf_url: publicUrl,
        })
        .eq('id', contract.id)

      if (updateErr) throw updateErr

      // 5.5 If the contract is linked to an asset, add it to assets_available
      if (contract.asset_id) {
        const { data: assetVal } = await supabase
          .from('assets_valuation')
          .select('*')
          .eq('id', contract.asset_id)
          .single()

        if (assetVal) {
          // Check if it already exists in assets_available to avoid duplicates
          const { data: existingAvail } = await supabase
            .from('assets_available')
            .select('id')
            .eq('asset_valuation_id', contract.asset_id)
            .maybeSingle()

          if (!existingAvail) {
            const capitalizedType = assetVal.asset_type.charAt(0).toUpperCase() + assetVal.asset_type.slice(1)
            await supabase.from('assets_available').insert({
              asset_valuation_id: contract.asset_id,
              title: `${capitalizedType} - ${assetVal.description}`,
              description: `Recibido como forma de pago / inversión de ${contract.profiles?.full_name || 'cliente'}.`,
              asset_type: assetVal.asset_type,
              listed_value: assetVal.market_value,
              currency: assetVal.currency || 'USD',
              status: 'disponible'
            })
          }
        }
      }

      // 6. Log contract signature event
      await supabase.from('contract_events').insert({
        contract_id: contract.id,
        event_type: 'signed',
        ip_address: ip,
        user_agent: navigator.userAgent,
        metadata: { hash: documentHash, url: publicUrl },
      })

      setSignSuccess(true)
    } catch (err: any) {
      console.error('Signing process error:', err)
      alert('Hubo un error al registrar la firma digital. Por favor, reintente en unos momentos.')
    } finally {
      setSigning(false)
    }
  }

  // Loading indicator
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4">
        <Loader2 className="w-12 h-12 text-emerald-400 animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Cargando contrato...</p>
      </div>
    )
  }

  // Error view
  if (errorMsg || !contract) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-4 border border-red-500/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Error en Contrato</h1>
        <p className="text-slate-400 max-w-md text-sm mb-6">{errorMsg}</p>
        <div className="text-xs text-slate-500 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
          FinanPre CRM v2.0 · Soporte administrativo
        </div>
      </div>
    )
  }

  // Already Signed or Sign Success View
  const isAlreadySigned = contract.status !== 'enviado' && contract.status !== 'borrador'

  if (signSuccess || isAlreadySigned) {
    const finalPdfUrl = signedPdfUrl || contract.contract_pdf_url

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
        <Card className="max-w-md w-full glass-card border-emerald-500/20 text-center py-6">
          <CardHeader>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-2 animate-bounce">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl font-bold gradient-text">¡Contrato Firmado!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-slate-400">
              El contrato digital ha sido firmado electrónicamente de forma exitosa por{' '}
              <strong className="text-slate-200">{contract.profiles?.full_name || 'Nombre no registrado'}</strong>.
            </p>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-left space-y-2.5 text-xs font-mono text-slate-400">
              <div className="flex justify-between">
                <span>Estado:</span>
                <span className="text-emerald-400 font-semibold uppercase">Firmado</span>
              </div>
              <div className="flex justify-between">
                <span>IP Registro:</span>
                <span>{contract.signer_ip || ip}</span>
              </div>
              <div className="flex justify-between">
                <span>Firmado el:</span>
                <span>{formatDate(contract.contract_signed_at || new Date().toISOString())}</span>
              </div>
              <div className="flex justify-between">
                <span>Hash SHA-256:</span>
                <span className="truncate max-w-[180px]">{contract.contract_hash || hash || 'Generando...'}</span>
              </div>
            </div>

            {finalPdfUrl ? (
              <a
                href={finalPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants(), "w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold gap-2 py-5 flex items-center justify-center")}
              >
                <Download className="w-4 h-4" />
                Descargar Contrato PDF
              </a>
            ) : (
              <div className="p-3 text-xs rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/20 flex gap-2 items-center">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Tu copia en PDF se está generando y estará disponible en instantes.</span>
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              Ya podés cerrar esta pestaña. Tu asesor de FinanPre ha sido notificado del acuerdo.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Variables structure to feed local template
  const today = new Date()
  const displayVariables = {
    fecha_contrato: formatDate(contract.created_at),
    nombre_cliente: contract.profiles?.full_name || '',
    dni_cliente: contract.profiles?.dni || '',
    domicilio_cliente: contract.profiles?.address || 'No registrado',
    moneda: contract.currency === 'ARS' ? '$ ARS' : '$ USD',
    monto_inicial: formatCurrency(contract.initial_capital, contract.currency),
    monto_letras: numberToWords(contract.initial_capital) + ' ' + (contract.currency === 'ARS' ? 'pesos' : 'dólares'),
    tasa_mensual: contract.monthly_rate.toString(),
    fecha_inicio: formatDate(contract.start_date),
    fecha_firma: formatDate(today.toISOString()),
    hora_firma: today.toLocaleTimeString('es-AR'),
    ip_firma: ip,
  }

  const filledContractHtml = fillContractTemplate(template?.content || DEFAULT_HTML_TEMPLATE, displayVariables, template?.name || 'Contrato')

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4 md:px-6 flex flex-col justify-between">
      {/* Container */}
      <div className="max-w-3xl w-full mx-auto space-y-6 flex-1">
        {/* Logo / Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-900">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <ShieldCheck className="w-4.5 h-4.5 text-slate-950" />
            </div>
            <div>
              <span className="font-bold tracking-wide text-white text-sm">FinanPre Digital</span>
              <span className="text-[10px] text-emerald-400 block -mt-1">Acuerdos Certificados</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400/80" />
            <span>Encriptación SSL SHA-256</span>
          </div>
        </div>

        {/* Info card */}
        <Card className="glass-card border-blue-500/10">
          <CardContent className="p-4 flex gap-3 text-xs text-blue-300">
            <PenTool className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-blue-200">Firma Electrónica Requerida</p>
              <p className="text-slate-400">
                Por favor, lea detalladamente el documento de inversión expuesto a continuación. Para firmar de forma válida, debe tildar las casillas de conformidad e ingresar su firma autógrafa en el canvas digital.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contract Viewer container */}
        <div className="border border-slate-800 bg-slate-900/50 rounded-2xl overflow-hidden shadow-xl">
          {/* Header */}
          <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-300">DOCUMENTO DE CONTRATO</span>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase border-blue-500/30 text-blue-400">
              Inversión v2.0
            </Badge>
          </div>

          {/* Document Content scrollable */}
          <div className="max-h-[420px] overflow-y-auto bg-slate-950/40 divide-y divide-slate-900">
            {/* The printable segment */}
            <div
              ref={contractPrintRef}
              id="contract-content-to-print"
              className="p-8 text-slate-300 font-sans leading-relaxed text-sm bg-slate-950"
              dangerouslySetInnerHTML={{ __html: filledContractHtml }}
            />
          </div>
        </div>

        {/* Acceptance Checkboxes */}
        <Card className="glass-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="check-read"
                checked={checkRead}
                onChange={(e) => setCheckRead(e.target.checked)}
                className="mt-1 w-4.5 h-4.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950 focus:ring-2 cursor-pointer"
              />
              <label
                htmlFor="check-read"
                className="text-xs text-slate-400 select-none cursor-pointer leading-normal"
              >
                Confirmo que he leído íntegramente las cláusulas expuestas en el contrato de inversión y que estoy de acuerdo con los montos, tasas, plazos y condiciones especificadas.
              </label>
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="check-legal"
                checked={checkLegal}
                onChange={(e) => setCheckLegal(e.target.checked)}
                className="mt-1 w-4.5 h-4.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-950 focus:ring-2 cursor-pointer"
              />
              <label
                htmlFor="check-legal"
                className="text-xs text-slate-400 select-none cursor-pointer leading-normal"
              >
                Acepto el uso de medios electrónicos para la celebración de este contrato y admito que mi firma manuscrita insertada a continuación tiene plena validez legal y es jurídicamente vinculante.
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Signature Box */}
        <Card className="glass-card overflow-hidden">
          <CardHeader className="bg-slate-900/40 border-b border-slate-800/60 pb-3">
            <CardTitle className="text-xs uppercase tracking-wider text-slate-300 flex items-center justify-between">
              <span>Firma Autógrafa Digital</span>
              <span className="text-[10px] text-muted-foreground font-normal normal-case">
                Dibuje su firma con el dedo o mouse dentro del recuadro
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {/* Signature Canvas */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/70 relative">
              {mounted && (
                <SignatureCanvas
                  ref={(ref) => {
                    sigCanvasRef.current = ref
                  }}
                  canvasProps={{
                    className: 'w-full h-40 cursor-crosshair',
                  }}
                  backgroundColor="rgba(15, 23, 42, 0.4)"
                  penColor="#10b981"
                />
              )}
              {/* Reset indicator */}
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 bottom-3 p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                title="Limpiar firma"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Submit Block */}
            <div className="pt-2">
              <Button
                onClick={handleSign}
                disabled={signing || !checkRead || !checkLegal}
                className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-bold hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-xl gap-2 shadow-lg shadow-emerald-500/10"
              >
                {signing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
                    Procesando firma y generando PDF...
                  </>
                ) : (
                  <>
                    <PenTool className="w-5 h-5 text-slate-950" />
                    Registrar Firma Digital
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="max-w-3xl w-full mx-auto text-center pt-8 text-[10px] text-slate-600 border-t border-slate-900/50 mt-10">
        <p>FinanPre digital compliance system v2.0</p>
        <p className="mt-0.5">Certificado emitido bajo estándares criptográficos SHA-256. IP registrada para auditoría legal: {ip}</p>
      </div>
    </div>
  )
}
