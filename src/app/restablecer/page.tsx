'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PasswordField } from '@/components/PasswordField'
import { checkPassword } from '@/lib/password'
import { TrendingUp, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react'

/**
 * Definición de la contraseña nueva, al volver del enlace de recuperación.
 * La sesión la deja escrita /auth/callback antes de llegar acá.
 */
export default function RestablecerPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then((result: { data: { session: unknown } }) => {
      setHasSession(Boolean(result.data.session))
      setChecking(false)
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const result = checkPassword(password)
    if (!result.valid) {
      setError(result.error ?? 'La contraseña no cumple los requisitos.')
      return
    }
    if (password !== confirm) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(
        /same/i.test(updateError.message)
          ? 'La contraseña nueva debe ser distinta de la anterior.'
          : updateError.message
      )
      setSaving(false)
      return
    }

    setDone(true)
    setSaving(false)

    // Se cierra la sesión del enlace para que el ingreso sea con la clave nueva
    await supabase.auth.signOut()
    setTimeout(() => router.replace('/login'), 2600)
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
          <p className="text-muted-foreground text-sm">Nueva contraseña</p>
        </div>

        <Card className="glass-card border-border/50">
          <CardContent className="pt-6 pb-6 px-6">
            {checking ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Validando el enlace...</p>
              </div>
            ) : done ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold">Contraseña actualizada</h2>
                  <p className="text-sm text-muted-foreground">
                    Ya podés entrar con tu contraseña nueva. Te llevamos al inicio de sesión.
                  </p>
                </div>
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : !hasSession ? (
              <div className="text-center space-y-4 py-2">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                  <AlertTriangle className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold">El enlace no es válido</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Puede haber vencido, ya haberse usado, o estar abierto en un navegador distinto
                    del que pidió el cambio. Pedí un enlace nuevo.
                  </p>
                </div>
                <Link href="/recuperar" className="inline-block pt-1">
                  <Button variant="outline" className="border-border/50">
                    Pedir un enlace nuevo
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3 mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-300/90 leading-relaxed">
                    Enlace verificado. Elegí una contraseña nueva: al guardarla se cierran las demás
                    sesiones abiertas.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <PasswordField
                    label="Contraseña nueva"
                    value={password}
                    onChange={setPassword}
                    showStrength
                    autoComplete="new-password"
                  />

                  <PasswordField
                    label="Repetir la contraseña"
                    value={confirm}
                    onChange={setConfirm}
                    autoComplete="new-password"
                  />

                  {confirm.length > 0 && password !== confirm && (
                    <p className="text-xs text-amber-400">Las dos contraseñas todavía no coinciden.</p>
                  )}

                  {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 font-semibold text-base"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}
                    disabled={saving || !password || !confirm}
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Guardando...
                      </span>
                    ) : (
                      'Guardar la contraseña'
                    )}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
