'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { TrendingUp, Shield, Eye, EyeOff, Loader2 } from 'lucide-react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  // Mensajes que deja /auth/callback cuando un enlace de correo falla
  useEffect(() => {
    const queryError = searchParams.get('error')
    if (queryError) setError(queryError)
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(
        /not confirmed/i.test(authError.message)
          ? 'Tu correo todavía no está confirmado. Buscá el mail de verificación que te enviamos.'
          : 'Credenciales inválidas. Verificá tu email y contraseña.'
      )
      setLoading(false)
      return
    }

    const user = data?.user
    if (!user) {
      setError('Error al obtener el usuario. Intentá nuevamente.')
      setLoading(false)
      return
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Una cuenta sin perfil no puede operar: antes quedaba rebotando en el
    // portal sin datos y sin ninguna explicación.
    if (profileError || !profile) {
      await supabase.auth.signOut()
      setError(
        'Tu cuenta está creada pero le falta el perfil. Escribinos para que la activemos.'
      )
      setLoading(false)
      return
    }

    // `replace` para que el botón "atrás" no vuelva al formulario ya usado
    if (profile.role === 'admin' || profile.role === 'vendedor') {
      router.replace('/admin')
    } else {
      router.replace('/portal')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-blue-accent/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-accent/5 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-accent/3 blur-3xl" />
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 8px 24px rgba(59,130,246,0.35)' }}
          >
            <TrendingUp className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-1 tracking-widest uppercase">RENDIMAX</h1>
          <p className="text-muted-foreground text-sm">Ecosistema Digital de Inversiones</p>
        </div>

        <Card className="glass-card border-border/50">
          <CardContent className="pt-6 pb-6 px-6">
            <form onSubmit={handleLogin} className="space-y-5">
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
                  className="h-12 bg-input/50 border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/50 text-base"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-foreground/80">
                    Contraseña
                  </Label>
                  <Link
                    href="/recuperar"
                    className="text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                  >
                    ¿La olvidaste?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 bg-input/50 border-border/50 focus:border-primary/50 placeholder:text-muted-foreground/50 pr-12 text-base"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-fade-in">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 font-semibold text-base transition-all duration-300"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Ingresando...
                  </span>
                ) : (
                  'Iniciar Sesión'
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                ¿No tenés cuenta?{' '}
                <Link href="/registro" className="text-blue-400 hover:underline font-semibold">
                  Registrate como inversor
                </Link>
              </p>
            </div>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
              <Shield className="w-3.5 h-3.5" />
              <span>Conexión segura y encriptada</span>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          © 2026 RENDIMAX — Diseñado por Galu Diseño Web
        </p>
      </div>
    </div>
  )
}

/**
 * `useSearchParams` obliga a envolver el formulario en Suspense para que la
 * página pueda prerenderizarse.
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
