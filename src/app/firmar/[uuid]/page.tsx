'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { getContractForSigning, submitSignedContract, getSignedPdfUrlByToken } from '../actions'
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
  Building2,
  Copy,
  Check,
} from 'lucide-react'
import {
  fillContractTemplate,
  formatCurrency,
  formatDate,
  formatDateLong,
  amountInWords,
} from '@/lib/helpers'
import type { Contract, Profile, ContractTemplate } from '@/lib/types'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'
import SignatureCanvas from 'react-signature-canvas'

// Fallback HTML template in case the DB one is not loaded yet
const DEFAULT_HTML_TEMPLATE = `
<div class="contract-preview p-6 text-slate-300 font-sans leading-relaxed space-y-6">
  <div class="text-center border-b border-slate-800 pb-6">
    <h1 class="text-xl font-bold tracking-wider text-blue-400">CONTRATO DE INVERSIÓN DIGITAL</h1>
    <p class="text-xs text-slate-500 mt-1">RENDIMAX · Plataforma de Inversiones</p>
  </div>
  
  <div class="space-y-4 text-sm">
    <p><strong>Fecha del Contrato:</strong> {{fecha_contrato}}</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">1. LAS PARTES</h2>
    <p>Por un lado, el <strong>INVERSOR</strong>, Sr./Sra. <strong>{{nombre_cliente}}</strong>, CUIT <strong>{{dni_cliente}}</strong>, con domicilio en <strong>{{domicilio_cliente}}</strong>.</p>
    <p>Y por el otro, la <strong>FINANCIERA</strong>, <strong>RENDIMAX</strong>, con domicilio legal en CABA, Argentina.</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">2. OBJETO DE LA INVERSIÓN</h2>
    <p>El INVERSOR aporta la suma de <strong>{{moneda}} {{monto_inicial}}</strong> (monto en letras: <em>{{monto_letras}}</em>) en concepto de capital de inversión.</p>
    <p>Sobre dicho capital se aplicará una tasa de interés mensual del <strong>{{tasa_mensual}}%</strong>, que se capitalizará de forma mensual (interés compuesto) de acuerdo a lo pactado.</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">3. PLAZO Y LIQUIDACIÓN</h2>
    <p>El plazo establecido de la inversión inicia el <strong>{{fecha_inicio}}</strong>. Las ganancias de interés se acumularán al capital inicial de forma compuesta cada 30 días.</p>
    <p>El INVERSOR podrá solicitar el retiro de su capital e intereses en cualquier momento desde su panel de usuario. RENDIMAX transferirá los fondos en un plazo no mayor a 48 horas hábiles.</p>
    
    <h2 class="text-base font-bold text-slate-200 mt-6 border-b border-slate-800/50 pb-2">4. MARCO LEGAL DE FIRMA ELECTRÓNICA</h2>
    <p>Las partes acuerdan y aceptan que la firma digital/electrónica provista en este acto goza de plena validez jurídica y probatoria bajo el marco regulatorio de la Ley 25.506 de Firma Digital en la República Argentina. Ambas partes renuncian a impugnar el documento por el solo hecho de haberse formalizado por medios electrónicos.</p>
    
    <div class="border-t border-slate-800 pt-6 mt-8 space-y-2 text-xs text-slate-500 bg-slate-950/30 p-4 rounded-xl">
      <p>🛡️ <strong>Información de Seguridad y Firma Electrónica:</strong></p>
      <ul class="list-disc pl-5 space-y-1">
        <li><strong>Firmante:</strong> {{nombre_cliente}} (CUIT: {{dni_cliente}})</li>
        <li><strong>Fecha de firma:</strong> {{fecha_firma}} a las {{hora_firma}}</li>
        <li><strong>Dirección IP:</strong> {{ip_firma}}</li>
      </ul>
    </div>
  </div>
</div>
`

/** Convierte el PDF a base64 para mandarlo a la server action. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const CHUNK = 0x8000 // por tramos: un spread de todo el array desborda la pila
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export default function PublicSigningPage() {
  const params = useParams()
  const uuid = params.uuid as string

  // States
  const [contract, setContract] = useState<(Contract & { profiles: Profile }) | null>(null)
  const [template, setTemplate] = useState<ContractTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  /**
   * IP que el servidor va a registrar, leída de los headers del request.
   * Antes se pedía a api.ipify.org desde el navegador y se mandaba como
   * parámetro: cualquiera podía falsearla, así que el registro no probaba nada.
   */
  const [ip, setIp] = useState('—')
  const [signError, setSignError] = useState<string | null>(null)
  /** Firma ya dibujada, para incrustarla en el documento antes de rasterizarlo. */
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)

  // Verification checkboxes
  const [checkRead, setCheckRead] = useState(false)
  const [checkLegal, setCheckLegal] = useState(false)

  // Bank transfer details (from system_settings)
  const [bankDetails, setBankDetails] = useState<{
    banco: string; cbu: string; alias: string; titular: string; cuit: string
  } | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Signing & Submission states
  const [signing, setSigning] = useState(false)
  const [signSuccess, setSignSuccess] = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)
  const [hash, setHash] = useState('')

  const sigCanvasRef = useRef<any>(null)
  const contractPrintRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fetch contract and template
  useEffect(() => {
    if (!uuid) return

    const fetchContract = async () => {
      try {
        setLoading(true)
        setErrorMsg(null)

        // Todo se resuelve en una server action acotada a este token: el
        // contrato, el firmante, la plantilla, los datos bancarios y la IP.
        const { data, error } = await getContractForSigning(uuid)

        if (error || !data) {
          setErrorMsg(error ?? 'El enlace de firma no es válido o ha expirado.')
          setLoading(false)
          return
        }

        setContract({ ...data.contract, profiles: data.profile } as Contract & { profiles: Profile })
        setIp(data.signerIp)

        if (data.template) setTemplate(data.template as ContractTemplate)
        if (data.bankDetails) setBankDetails(data.bankDetails as any)

        // Si ya estaba firmado, se pide el enlace de descarga del PDF
        if (data.contract.contract_signed_at) {
          const { url } = await getSignedPdfUrlByToken(uuid)
          if (url) setSignedPdfUrl(url)
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

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  // Clear signature canvas
  const handleClear = () => {
    if (sigCanvasRef.current) {
      sigCanvasRef.current.clear()
    }
  }

  // Handle signature submit
  const handleSign = async () => {
    if (!contract || !mounted) return
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setSignError('Dibujá tu firma en el recuadro antes de continuar.')
      return
    }

    setSigning(true)
    setSignError(null)

    try {
      const signatureImgData = sigCanvasRef.current.getTrimmedCanvas().toDataURL('image/png')

      // La firma se inserta en el documento ANTES de rasterizarlo, para que
      // quede dentro del PDF y no sólo en una hoja suelta al final.
      setSignatureDataUrl(signatureImgData)
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )

      const printContainer = contractPrintRef.current
      if (!printContainer) throw new Error('Contenedor de impresión no encontrado')

      // Generate PDF using html2canvas-pro & jsPDF
      const canvas = await html2canvas(printContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
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

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      let pageCount = 1
      while (heightLeft > 0 && pageCount < 30) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
        pageCount++
      }

      const today = new Date()

      // Constancia de firma. El hash definitivo lo calcula el servidor sobre
      // los bytes de este PDF, así que acá sólo van los datos del acto.
      pdf.addPage()
      pdf.setFontSize(14)
      pdf.setTextColor(29, 78, 216) // blue-700
      pdf.text('CONSTANCIA DE FIRMA ELECTRÓNICA', 20, 30)
      pdf.setFontSize(10)
      pdf.setTextColor(71, 85, 105) // slate-600
      pdf.text(`Firmante: ${contract.profiles?.full_name || 'Nombre no registrado'}`, 20, 45)
      pdf.text(`CUIT: ${contract.profiles?.cuit || 'CUIT no registrado'}`, 20, 52)
      pdf.text(
        `Fecha y hora: ${formatDate(today.toISOString())} - ${today.toLocaleTimeString('es-AR')}`,
        20, 59
      )
      pdf.text(`Dirección IP registrada por el servidor: ${ip}`, 20, 66)
      pdf.text('Firma autógrafa digitalizada:', 20, 78)
      pdf.addImage(signatureImgData, 'PNG', 20, 83, 80, 40)
      pdf.setFontSize(8)
      pdf.text(
        'El hash SHA-256 de integridad de este documento queda asentado en el registro de',
        20, 135
      )
      pdf.text('auditoría de RENDIMAX al momento de su emisión (Ley 25.506).', 20, 140)

      // El PDF viaja al servidor: ahí se hashea y se guarda en un bucket privado
      const pdfArrayBuffer = pdf.output('arraybuffer')
      const pdfBase64 = arrayBufferToBase64(pdfArrayBuffer)

      const result = await submitSignedContract({
        token: uuid,
        pdfBase64,
        signatureBase64: signatureImgData.split(',')[1] ?? '',
        userAgent: navigator.userAgent,
      })

      if (result.error) {
        if (result.alreadySigned) {
          setSignSuccess(true)
          return
        }
        setSignError(result.error)
        return
      }

      if (result.hash) setHash(result.hash)
      if (result.pdfUrl) setSignedPdfUrl(result.pdfUrl)
      setSignSuccess(true)
    } catch (err: any) {
      console.error('Signing process error:', err)
      setSignError(
        'Hubo un error al registrar la firma. Verificá tu conexión y reintentá en unos momentos.'
      )
    } finally {
      setSigning(false)
    }
  }

  // Loading indicator
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-4">
        <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-4" />
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
          RENDIMAX CRM v2.0 · Soporte administrativo
        </div>
      </div>
    )
  }

  // Already Signed or Sign Success View
  const isAlreadySigned = contract.status !== 'enviado' && contract.status !== 'borrador'

  if (signSuccess || isAlreadySigned) {
    // El bucket es privado: la URL sale firmada de la server action y dura una
    // hora. `contract_pdf_url` quedó sólo como registro histórico.
    const finalPdfUrl = signedPdfUrl

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
              Ya podés cerrar esta pestaña. Tu asesor de RENDIMAX ha sido notificado del acuerdo.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Variables que alimentan la plantilla, tanto en la vista previa como en el PDF
  const today = new Date()
  const displayVariables = {
    fecha_contrato: formatDateLong(contract.created_at),
    nombre_cliente: contract.profiles?.full_name || '',
    dni_cliente: contract.profiles?.cuit || '',
    cuit_cliente: contract.profiles?.cuit || '',
    domicilio_cliente: contract.profiles?.address || 'No registrado',
    moneda: contract.currency === 'ARS' ? '$ ARS' : 'US$',
    monto_inicial: formatCurrency(contract.initial_capital, contract.currency),
    // amountInWords soporta millones: numberToWords devolvía dígitos a partir
    // de 1.000.000, así que casi ningún contrato en pesos tenía monto en letras
    monto_letras: amountInWords(contract.initial_capital, contract.currency),
    tasa_mensual: contract.monthly_rate.toString(),
    fecha_inicio: formatDateLong(contract.start_date),
    fecha_vencimiento: formatDateLong(contract.end_date),
    fecha_firma: formatDateLong(today.toISOString()),
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
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <ShieldCheck className="w-4.5 h-4.5 text-slate-950" />
            </div>
            <div>
              <span className="font-bold tracking-wide text-white text-sm">RENDIMAX Digital</span>
              <span className="text-[10px] text-blue-400 block -mt-1">Acuerdos Certificados</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-blue-400/80" />
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
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-slate-300">DOCUMENTO DE CONTRATO</span>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase border-blue-500/30 text-blue-400">
              Inversión v2.0
            </Badge>
          </div>

          {/* Document Content scrollable */}
          <div className="max-h-[420px] overflow-y-auto bg-slate-950/40 divide-y divide-slate-900">
            <div
              className="p-8 text-slate-300 font-sans leading-relaxed text-sm bg-slate-950"
              dangerouslySetInnerHTML={{ __html: filledContractHtml }}
            />
          </div>
        </div>

        {/*
          Hoja de impresión fuera de pantalla.
          El PDF se generaba a partir de la vista previa oscura, así que salía un
          contrato negro, ilegible al imprimirlo y carísimo en tinta. Esta hoja
          replica el contenido con fondo blanco y texto oscuro, en ancho A4.
        */}
        <div aria-hidden className="fixed -left-[9999px] top-0 pointer-events-none" >
          <div ref={contractPrintRef} className="contract-print-sheet">
            <div dangerouslySetInnerHTML={{ __html: filledContractHtml }} />

            {signatureDataUrl && (
              <div className="contract-print-signature">
                <p className="contract-print-signature-label">Firma autógrafa digitalizada</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureDataUrl} alt="Firma del cliente" width={260} />
                <p className="contract-print-signature-name">
                  {contract.profiles?.full_name || ''}
                  {contract.profiles?.cuit ? ` — CUIT ${contract.profiles.cuit}` : ''}
                </p>
              </div>
            )}
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
                className="mt-0.5 w-5 h-5 shrink-0 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-950 focus:ring-2 cursor-pointer"
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
                className="mt-0.5 w-5 h-5 shrink-0 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-950 focus:ring-2 cursor-pointer"
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

        {/* Sin datos bancarios cargados: el cliente igual debe saber cómo seguir */}
        {checkRead && checkLegal && !bankDetails && (
          <Card className="border border-blue-500/30 bg-blue-950/20 animate-fade-in">
            <CardContent className="p-4 flex gap-3 text-xs text-blue-300">
              <Building2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-blue-200">Datos de transferencia</p>
                <p className="text-slate-400 leading-relaxed">
                  Tu asesor de RENDIMAX te enviará los datos de la cuenta bancaria apenas registres tu firma.
                  El contrato se activa cuando se confirma la acreditación de los fondos.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bank Transfer Details — only when both boxes are confirmed */}
        {checkRead && checkLegal && bankDetails && (
          <Card className="border border-blue-500/40 bg-gradient-to-br from-blue-950/60 to-slate-950/60 animate-fade-in">
            <CardHeader className="pb-3 pt-4 px-5">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-300">
                <Building2 className="w-4 h-4" />
                Datos para Realizar la Transferencia
              </CardTitle>
              <p className="text-[11px] text-blue-400/70 mt-0.5">
                Una vez firmado el contrato, transferí el capital acordado a la siguiente cuenta bancaria.
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-2">
              {([
                { label: 'Banco', value: bankDetails.banco, field: 'banco', mono: false },
                { label: 'Titular', value: bankDetails.titular, field: 'titular', mono: false },
                { label: 'CUIT del Titular', value: bankDetails.cuit, field: 'cuit', mono: false },
                { label: 'CBU / CVU', value: bankDetails.cbu, field: 'cbu', mono: true },
                { label: 'Alias', value: bankDetails.alias, field: 'alias', mono: true },
              ] as { label: string; value: string; field: string; mono: boolean }[]).map(({ label, value, field, mono }) => (
                <div key={field} className="flex items-center justify-between gap-3 py-2 border-b border-blue-900/40 last:border-0">
                  <div>
                    <span className="text-[10px] text-blue-400/60 uppercase tracking-wider block">{label}</span>
                    <span className={`text-sm font-semibold text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(value, field)}
                    className="p-1.5 rounded-lg bg-blue-900/30 border border-blue-700/30 text-blue-400 hover:bg-blue-800/40 transition-colors shrink-0"
                    title={`Copiar ${label}`}
                  >
                    {copiedField === field ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
              <p className="text-[10px] text-blue-400/50 pt-2">
                ⚠️ Importante: El contrato se activará una vez que el administrador confirme la recepción de los fondos.
              </p>
            </CardContent>
          </Card>
        )}

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
                  // Tinta oscura: la firma termina sobre la hoja blanca del PDF,
                  // donde el verde del tema apenas se distinguía
                  penColor="#1d4ed8"
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

            {signError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex gap-2 items-start animate-fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{signError}</span>
              </div>
            )}

            {(!checkRead || !checkLegal) && (
              <p className="text-[11px] text-muted-foreground">
                Tildá las dos casillas de conformidad para habilitar la firma.
              </p>
            )}

            {/* Submit Block */}
            <div className="pt-2">
              <Button
                onClick={handleSign}
                disabled={signing || !checkRead || !checkLegal}
                className="w-full h-12 bg-gradient-to-r from-blue-500 to-blue-600 text-slate-950 font-bold hover:from-blue-400 hover:to-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-xl gap-2 shadow-lg shadow-blue-500/10"
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
        <p>RENDIMAX digital compliance system v2.0</p>
        <p className="mt-0.5">Certificado emitido bajo estándares criptográficos SHA-256. IP registrada para auditoría legal: {ip}</p>
      </div>
    </div>
  )
}
