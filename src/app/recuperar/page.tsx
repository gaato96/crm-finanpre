'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, Loader2, MailCheck, ArrowLeft, KeyRound } from 'lucide-react'

/**
 * Solicitud de recuperación de contraseña.
 *
 * Antes no existía ningún camino de reset: cada olvido era un ticket manual al
 * administrador, que terminaba cambiando la contraseña a mano.
 */
export default function RecuperarPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer`,
    })

    // No se distingue entre "existe" y "no existe": decirlo permitiría
    // averiguar qué direcciones tienen cuenta en la plataforma.
    if (resetError && !/rate|limit|seconds/i.test(resetError.message)) {
      console.error('Reset password error:', resetError.message)
    }
    if (resetError && /rate|limit|seconds/i.test(resetError.message)) {
      setError('Pediste varios correos seguidos. Esperá unos minutos antes de reintentar.')
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-accent/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}
          >
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-1 tracking-widest uppercase">RENDIMAX</h1>
          <p className="text-muted-foreground text-sm">Recuperar el acceso</p>
        </div>

        <Card className="glass-card border-border/50">
          <CardContent className="pt-6 pb-6 px-6">
            {sent ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <MailCheck className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold">Revisá tu correo</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Si <strong className="text-foreground/80">{email}</strong> tiene una cuenta en
                    RENDIMAX, te enviamos un enlace para crear una contraseña nueva. El enlace vence
                    en una hora y sirve una sola vez.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  No te olvides de mirar la carpeta de correo no deseado.
                </p>
                <Link href="/login" className="inline-block pt-1">
                  <Button variant="outline" className="border-border/50 gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    Volver a iniciar sesión
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <KeyRound className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300/90 leading-relaxed">
                    Ingresá el correo con el que te registrás y te mandamos un enlace para definir
                    una contraseña nueva.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-foreground/80">
                      Correo Electrónico
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-12 bg-input/50 border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/50 text-base"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 font-semibold text-base"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}
                    disabled={loading || !email}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Enviando...
                      </span>
                    ) : (
                      'Enviarme el enlace'
                    )}
                  </Button>
                </form>

                <div className="mt-5 text-center">
                  <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    ← Volver a iniciar sesión
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
