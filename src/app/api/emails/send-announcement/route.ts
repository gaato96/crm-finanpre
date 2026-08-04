import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'La API Key de Resend no está configurada.' }, { status: 500 })
    }
    const resend = new Resend(apiKey)

    // Only admins can send mass emails
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const { announcementId, title, content, type } = await req.json()
    if (!title || !content) {
      return NextResponse.json({ error: 'Faltan datos del anuncio' }, { status: 400 })
    }

    // Fetch all investor emails
    const { data: investors, error: investorsError } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'investor')
    
    if (investorsError || !investors || investors.length === 0) {
      return NextResponse.json({ error: 'No se encontraron inversores', details: investorsError?.message }, { status: 404 })
    }

    // Color palette based on announcement type
    const typeColors: Record<string, { bg: string; accent: string; label: string }> = {
      info: { bg: '#1e3a5f', accent: '#3b82f6', label: 'ℹ️ Informativo' },
      promo: { bg: '#1a3a2a', accent: '#22c55e', label: '🔥 Promoción' },
      warning: { bg: '#3d2a0f', accent: '#f97316', label: '⚠️ Alerta' },
    }
    const colors = typeColors[type] || typeColors.info
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rendimax.com.ar'

    // Build HTML email
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <div style="font-size:28px;font-weight:900;color:#60a5fa;letter-spacing:2px;">RENDI<span style="color:#ffffff;">MAX</span></div>
              <div style="font-size:12px;color:#93c5fd;margin-top:4px;letter-spacing:2px;text-transform:uppercase;">Plataforma de Inversiones</div>
            </td>
          </tr>
          <!-- Badge -->
          <tr>
            <td style="background:${colors.bg};padding:16px 40px 0;text-align:center;">
              <span style="display:inline-block;background:${colors.accent}22;border:1px solid ${colors.accent}44;color:${colors.accent};font-size:11px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">${colors.label}</span>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background:${colors.bg};border-radius:0 0 16px 16px;padding:24px 40px 40px;">
              <h1 style="color:#f1f5f9;font-size:24px;font-weight:800;margin:0 0 16px;line-height:1.3;">${title}</h1>
              <div style="color:#94a3b8;font-size:15px;line-height:1.7;white-space:pre-line;">${content}</div>
              <!-- CTA -->
              <div style="margin-top:32px;text-align:center;">
                <a href="${appUrl}/portal"
                   style="display:inline-block;background:#3b82f6;color:#ffffff;font-weight:800;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">
                  Ver mi Portal →
                </a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;text-align:center;">
              <p style="color:#374151;font-size:11px;margin:0;line-height:1.6;">
                Este correo fue enviado a tu dirección registrada en RENDIMAX.<br>
                Si tenés preguntas, contactanos por WhatsApp.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

    // Envío por lotes: una sola llamada a Resend cada 100 destinatarios
    // (el envío secuencial tardaba un request por inversor).
    const from = process.env.RESEND_FROM_EMAIL || 'RENDIMAX <noreply@rendimax.com.ar>'
    const recipients = investors
      .map((i) => i.email)
      .filter((email): email is string => Boolean(email))

    const BATCH_SIZE = 100
    let sent = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const chunk = recipients.slice(i, i + BATCH_SIZE)
      try {
        const { error } = await resend.batch.send(
          chunk.map((email) => ({
            from,
            to: email,
            subject: `[RENDIMAX] ${title}`,
            html: htmlContent,
          }))
        )
        if (error) {
          failed += chunk.length
          console.error('Resend batch error:', error)
        } else {
          sent += chunk.length
        }
      } catch (err: any) {
        failed += chunk.length
        console.error('Resend batch exception:', err?.message)
      }
    }

    // Log the send event in the DB if announcementId provided
    if (announcementId) {
      await supabase.from('announcements').update({
        last_email_sent_at: new Date().toISOString(),
        email_recipients_count: sent,
      }).eq('id', announcementId)
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total: recipients.length,
    })
  } catch (err: any) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: err.message || 'Error al enviar' }, { status: 500 })
  }
}
