'use server'

import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { getServiceClient } from '@/lib/auth-guard'

/**
 * Firma electrónica del contrato.
 *
 * La versión anterior hacía todo desde el navegador: pedía la IP a
 * api.ipify.org y la mandaba como parámetro (falsificable con una línea de
 * consola), calculaba el hash sobre un HTML que incluía la hora y la IP —
 * irreproducible, así que no verificaba nada— y subía el PDF al bucket con una
 * política abierta a cualquier visitante anónimo.
 *
 * Ahora: la IP sale de los headers del request, el hash se calcula sobre los
 * bytes del PDF que efectivamente quedan almacenados, y la subida usa la clave
 * de servicio contra un bucket privado.
 */

/** IP real del cliente, según los headers que pone el proxy de Vercel. */
async function getClientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) {
    // El primer valor es el cliente original; el resto son los proxies
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? 'desconocida'
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Tope de tamaño del PDF firmado (coincide con el límite de la server action). */
const MAX_PDF_BYTES = 6 * 1024 * 1024

export interface SigningPayload {
  contract: Record<string, any>
  profile: { full_name: string; cuit: string; address: string | null }
  template: Record<string, any> | null
  bankDetails: Record<string, string> | null
  /** IP que va a quedar registrada, para mostrarla en el documento. */
  signerIp: string
}

/**
 * Datos del contrato a firmar, acotados al token.
 * Pasa por el servidor para que la RPC ya no quede expuesta al rol anónimo.
 */
export async function getContractForSigning(
  token: string
): Promise<{ data?: SigningPayload; error?: string }> {
  try {
    if (!UUID_RE.test(token)) {
      return { error: 'El enlace de firma no es válido.' }
    }

    const admin = getServiceClient()
    const { data, error } = await admin.rpc('get_contract_for_signing', { p_token: token })

    if (error) {
      console.error('get_contract_for_signing error:', error.message)
      return { error: 'No se pudo cargar el contrato. Reintentá en unos momentos.' }
    }
    if (!data?.contract) {
      return { error: 'El enlace de firma no es válido o ya expiró.' }
    }

    return {
      data: {
        contract: data.contract,
        profile: data.profile,
        template: data.template ?? null,
        bankDetails: data.bank_details ?? null,
        signerIp: await getClientIp(),
      },
    }
  } catch (err: any) {
    console.error('getContractForSigning exception:', err?.message)
    return { error: 'Ocurrió un error al cargar el contrato.' }
  }
}

/**
 * Registra la firma: sube el PDF, lo hashea y deja el evento de auditoría.
 * Devuelve una URL firmada de corta duración para que el cliente lo descargue.
 */
export async function submitSignedContract(input: {
  token: string
  /** PDF en base64, sin el prefijo `data:`. */
  pdfBase64: string
  /** PNG de la firma autógrafa en base64, para hashear por separado. */
  signatureBase64: string
  userAgent: string
}): Promise<{ success?: true; pdfUrl?: string; hash?: string; ip?: string; error?: string; alreadySigned?: true }> {
  try {
    const { token, pdfBase64, signatureBase64, userAgent } = input

    if (!UUID_RE.test(token)) {
      return { error: 'El enlace de firma no es válido.' }
    }
    if (!pdfBase64) {
      return { error: 'No se recibió el documento firmado.' }
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    if (pdfBuffer.length === 0) {
      return { error: 'El documento firmado llegó vacío. Reintentá la firma.' }
    }
    if (pdfBuffer.length > MAX_PDF_BYTES) {
      return { error: 'El documento generado es demasiado grande. Avisá a tu asesor.' }
    }
    // Firma mínima de un PDF: evita que se suba cualquier otra cosa
    if (pdfBuffer.subarray(0, 4).toString('latin1') !== '%PDF') {
      return { error: 'El archivo generado no es un PDF válido. Reintentá la firma.' }
    }

    const admin = getServiceClient()
    const ip = await getClientIp()

    // El contrato tiene que existir y estar pendiente ANTES de subir nada
    const { data: contract, error: contractError } = await admin
      .from('contracts')
      .select('id, status')
      .eq('sign_token', token)
      .maybeSingle()

    if (contractError || !contract) {
      return { error: 'El enlace de firma no es válido o ya expiró.' }
    }
    if (contract.status !== 'borrador' && contract.status !== 'enviado') {
      return { error: 'Este contrato ya fue firmado.', alreadySigned: true }
    }

    const pdfHash = sha256(pdfBuffer)
    const signatureHash = signatureBase64
      ? sha256(Buffer.from(signatureBase64, 'base64'))
      : ''
    const path = `${contract.id}_signed.pdf`

    const { error: uploadError } = await admin.storage
      .from('contracts')
      .upload(path, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('Storage upload error:', uploadError.message)
      return { error: 'No se pudo guardar el documento firmado. Reintentá en unos momentos.' }
    }

    const { data: signResult, error: signError } = await admin.rpc('sign_contract_v2', {
      p_token: token,
      p_ip: ip,
      p_pdf_hash: pdfHash,
      p_pdf_path: path,
      p_signature_hash: signatureHash,
      p_user_agent: (userAgent || '').slice(0, 500),
    })

    if (signError) {
      console.error('sign_contract_v2 error:', signError.message)
      return { error: 'No se pudo registrar la firma. Reintentá en unos momentos.' }
    }
    if (signResult?.error && !signResult?.already_signed) {
      return { error: signResult.error }
    }
    if (signResult?.already_signed) {
      return { error: 'Este contrato ya fue firmado.', alreadySigned: true }
    }

    const { data: signed } = await admin.storage
      .from('contracts')
      .createSignedUrl(path, 60 * 60) // una hora para descargar la copia

    return { success: true, pdfUrl: signed?.signedUrl, hash: pdfHash, ip }
  } catch (err: any) {
    console.error('submitSignedContract exception:', err?.message)
    return { error: 'Ocurrió un error al registrar la firma.' }
  }
}

/**
 * URL firmada del PDF de un contrato ya firmado, para quien tiene el token.
 * El bucket pasó a ser privado: una URL pública quedaba accesible para siempre.
 */
export async function getSignedPdfUrlByToken(
  token: string
): Promise<{ url?: string; error?: string }> {
  try {
    if (!UUID_RE.test(token)) return { error: 'Enlace inválido.' }

    const admin = getServiceClient()
    const { data: contract } = await admin
      .from('contracts')
      .select('id, contract_pdf_path')
      .eq('sign_token', token)
      .maybeSingle()

    if (!contract) return { error: 'Enlace inválido.' }

    const path = contract.contract_pdf_path || `${contract.id}_signed.pdf`
    const { data, error } = await admin.storage.from('contracts').createSignedUrl(path, 60 * 60)

    if (error || !data?.signedUrl) return { error: 'El documento todavía no está disponible.' }
    return { url: data.signedUrl }
  } catch {
    return { error: 'No se pudo generar el enlace de descarga.' }
  }
}
