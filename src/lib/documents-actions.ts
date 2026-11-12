'use server'

import { getServiceClient, getCurrentRole } from '@/lib/auth-guard'

/**
 * Enlace de descarga del PDF de un contrato firmado.
 *
 * El bucket `contracts` era público: una vez conocida la URL, el documento
 * quedaba accesible para siempre y sin autenticación. Ahora es privado y se
 * sirve con URLs firmadas de una hora, validando quién las pide:
 * el personal accede a cualquiera, el inversor sólo a los suyos.
 */
export async function getContractPdfUrl(
  contractId: string
): Promise<{ url?: string; error?: string }> {
  try {
    const current = await getCurrentRole()
    if (!current) return { error: 'Sesión expirada. Volvé a iniciar sesión.' }

    const admin = getServiceClient()
    const { data: contract, error } = await admin
      .from('contracts')
      .select('id, client_id, contract_pdf_path, contract_pdf_url, contract_signed_at')
      .eq('id', contractId)
      .maybeSingle()

    if (error || !contract) return { error: 'No se encontró el contrato.' }

    const isStaff = current.role === 'admin' || current.role === 'vendedor'
    if (!isStaff && contract.client_id !== current.userId) {
      return { error: 'Este documento no te pertenece.' }
    }
    if (!contract.contract_signed_at) {
      return { error: 'El contrato todavía no fue firmado.' }
    }

    // Los contratos viejos no tienen `contract_pdf_path`: se deriva del nombre
    // que la pantalla de firma usó siempre.
    const path = contract.contract_pdf_path || `${contract.id}_signed.pdf`

    const { data: signed, error: signError } = await admin.storage
      .from('contracts')
      .createSignedUrl(path, 60 * 60)

    if (signError || !signed?.signedUrl) {
      return { error: 'El documento no está disponible. Avisale a tu asesor.' }
    }

    return { url: signed.signedUrl }
  } catch (err: any) {
    console.error('getContractPdfUrl exception:', err?.message)
    return { error: 'No se pudo generar el enlace de descarga.' }
  }
}
