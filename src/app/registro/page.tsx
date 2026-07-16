'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  User, 
  Mail, 
  Lock, 
  Phone, 
  MapPin, 
  TrendingUp, 
  ChevronRight, 
  CheckCircle2, 
  Loader2, 
  FileText,
  Calculator,
  AlertCircle,
  Hash,
  ArrowRight
} from 'lucide-react'
import { formatCurrency } from '@/lib/helpers'

export default function RegistroPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Paso 1 Form Data
  const [fullName, setFullName] = useState('')
  const [cuit, setCuit] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Yield settings
  const [rates, setRates] = useState({ ars: 8.5, usd: 5.0 })

  // Paso 2 Form Data (Simulation)
  const [simCurrency, setSimCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [simCapital, setSimCapital] = useState<number>(1000000)

  // Fetch rates on mount
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'monthly_yield_config')
          .maybeSingle()
        if (data?.value) {
          const val = data.value as any
          setRates({
            ars: val.ars_monthly_rate || 8.5,
            usd: val.usd_monthly_rate || 5.0
          })
        }
      } catch (err) {
        console.error('Error fetching rates:', err)
      }
    }
    fetchRates()

    // Read initial simulation params from query if present
    const params = new URLSearchParams(window.location.search)
    const qCurr = params.get('currency')
    const qCap = params.get('capital')
    if (qCurr === 'ARS' || qCurr === 'USD') setSimCurrency(qCurr)
    if (qCap) setSimCapital(Math.max(0, parseInt(qCap) || 1000000))
  }, [])

  const currentRate = simCurrency === 'ARS' ? rates.ars : rates.usd

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Basic validation
    if (!fullName || !cuit || !phone || !address || !email || !password) {
      setError('Por favor completá todos los campos.')
      setLoading(false)
      return
    }

    if (cuit.replace(/\D/g, '').length !== 11) {
      setError('El CUIT debe tener 11 dígitos.')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()

      // 1. Sign up user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            cuit: cuit.replace(/\D/g, ''),
            role: 'investor'
          }
        }
      })

      if (signUpError) {
        throw signUpError
      }

      if (!authData.user) {
        throw new Error('No se pudo crear el usuario.')
      }

      // 2. Wait a small delay and update the profile fields that trigger doesn't write automatically
      // Trigger handle_new_user runs asynchronously, let's wait a bit then update
      await new Promise(r => setTimeout(r, 800))
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          phone,
          address
        })
        .eq('id', authData.user.id)

      if (updateError) {
        console.error('Error updating phone and address on profile:', updateError)
        // We do not fail the whole process if only these fields fail, but let's try again
        await supabase.from('profiles').update({ phone, address }).eq('id', authData.user.id)
      }

      // Success, move to step 2 (Simulation)
      setStep(2)
    } catch (err: any) {
      console.error('Registration error:', err)
      setError(err.message || 'Ocurrió un error al registrar el usuario.')
    } finally {
      setLoading(false)
    }
  }

  const handleStep2Submit = async () => {
    // Client completed simulation, now we can log them in / redirect
    setStep(3)
  }

  // Projections calculations
  const projections = [
    { months: 1, label: '1 Mes', colorClass: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { months: 3, label: '3 Meses', colorClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
    { months: 6, label: '6 Meses', colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
    { months: 12, label: '12 Meses', colorClass: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
  ].map(p => {
    const finalCapital = simCapital * Math.pow(1 + currentRate / 100, p.months)
    const gains = finalCapital - simCapital
    return {
      ...p,
      finalCapital,
      gains
    }
  })

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-center items-center p-4 relative selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Background decoration */}
      <div className="absolute top-10 left-10 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl space-y-6 z-10">
        {/* Branding header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div 
            onClick={() => router.push('/')}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-2xl font-bold tracking-wider bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
            FinanPRE
          </h2>
          <p className="text-xs text-slate-400">Creá tu Cuenta de Inversor</p>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 px-8">
          <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-emerald-500' : 'bg-white/10'}`} />
          <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-emerald-500' : 'bg-white/10'}`} />
          <div className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step >= 3 ? 'bg-emerald-500' : 'bg-white/10'}`} />
        </div>

        {error && (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex items-center gap-3 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Step 1: Personal Data Form */}
        {step === 1 && (
          <Card className="glass-card border-white/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-400" />
                1. Datos Personales
              </CardTitle>
              <CardDescription>
                Completá los campos requeridos para crear tu perfil de inversor
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="fullName">Nombre Completo</Label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="fullName"
                        placeholder="Ej: Juan Pérez"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-9 bg-white/5 border-white/10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cuit">CUIT (11 dígitos)</Label>
                    <div className="relative">
                      <Hash className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="cuit"
                        placeholder="20-12345678-9"
                        value={cuit}
                        onChange={(e) => setCuit(e.target.value)}
                        className="pl-9 bg-white/5 border-white/10"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Teléfono de Contacto</Label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="phone"
                        placeholder="Ej: 3814000000"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-9 bg-white/5 border-white/10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="address">Domicilio Legal</Label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <Input
                        id="address"
                        placeholder="Ej: Av. Aconquija 1200"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="pl-9 bg-white/5 border-white/10"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@ejemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 bg-white/5 border-white/10"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-6 rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Registrarme y Continuar <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              <div className="text-center mt-4">
                <p className="text-xs text-slate-500">
                  ¿Ya tenés cuenta?{' '}
                  <span 
                    onClick={() => router.push('/login')} 
                    className="text-emerald-400 hover:underline cursor-pointer font-medium"
                  >
                    Iniciá sesión aquí
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Inversiones Simulation */}
        {step === 2 && (
          <Card className="glass-card border-white/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                2. Simular Inversión de Bienvenida
              </CardTitle>
              <CardDescription>
                Simulá las ganancias para tu primera inversión autogestionada
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Moneda</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSimCurrency('ARS')}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                        simCurrency === 'ARS'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                          : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      Pesos ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimCurrency('USD')}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                        simCurrency === 'USD'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                          : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      Dólares (US$)
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="simCapital">Capital Inicial</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">
                      {simCurrency === 'ARS' ? '$' : 'US$'}
                    </span>
                    <Input
                      id="simCapital"
                      type="number"
                      value={simCapital}
                      onChange={(e) => setSimCapital(Math.max(0, parseInt(e.target.value) || 0))}
                      className="pl-8 bg-white/5 border-white/10 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Colorful capital projections */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Proyecciones Proyectadas (Tasa actual: {currentRate}%)</Label>
                <div className="grid grid-cols-2 gap-3">
                  {projections.map((p) => (
                    <div
                      key={p.months}
                      className={`p-4 rounded-xl border flex flex-col justify-between h-[100px] ${p.colorClass}`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">{p.label}</span>
                      <div>
                        <div className="text-base font-extrabold font-mono leading-none">
                          {formatCurrency(p.finalCapital, simCurrency)}
                        </div>
                        <div className="text-[10px] opacity-75 mt-1 font-mono text-right">
                          +{formatCurrency(p.gains, simCurrency)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleStep2Submit}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-6 rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2"
              >
                Confirmar y Ver Siguientes Pasos <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Next Steps */}
        {step === 3 && (
          <Card className="glass-card border-white/5 text-center p-6 space-y-6">
            <CardHeader className="flex flex-col items-center">
              <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-pulse" />
              <CardTitle className="text-xl font-bold mt-4">¡Tu Cuenta fue Creada Exitosamente!</CardTitle>
              <CardDescription className="text-slate-400">
                Tu perfil de inversor ya se encuentra activo en el ecosistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-left space-y-4 bg-white/5 border border-white/5 p-5 rounded-2xl">
                <h4 className="font-bold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" /> Próximos pasos para tu Inversión:
                </h4>
                
                <ul className="space-y-3 text-xs text-slate-400">
                  <li className="flex gap-2 items-start">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">1</span>
                    <span><strong>Completá los datos de tu inversión:</strong> Moneda, Capital y Fecha de Inicio desde tu portal.</span>
                  </li>
                  <li className="flex gap-2 items-start">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">2</span>
                    <span><strong>Revisá y firmá el contrato:</strong> Se generará en base a la plantilla legal predefinida y lo firmarás de manera digital.</span>
                  </li>
                  <li className="flex gap-2 items-start">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">3</span>
                    <span><strong>Realizá la transferencia:</strong> El portal te mostrará los datos de cuenta bancaria.</span>
                  </li>
                  <li className="flex gap-2 items-start">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">4</span>
                    <span><strong>¡Listo!</strong> El administrador acreditará los fondos y tu inversión comenzará a rendir intereses segundo a segundo.</span>
                  </li>
                </ul>
              </div>

              <Button
                onClick={() => router.replace(`/portal?currency=${simCurrency}&capital=${simCapital}`)}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-6 rounded-xl shadow-lg shadow-emerald-500/10 transition-all flex items-center justify-center gap-2"
              >
                Ingresar a mi Portal de Inversor <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
