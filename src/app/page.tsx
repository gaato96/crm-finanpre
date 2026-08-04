'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  TrendingUp, 
  ChevronRight, 
  ArrowRight,
  ShieldCheck, 
  Coins, 
  FileText, 
  Sparkles, 
  Calculator,
  UserPlus,
  LogIn,
  Activity,
  Car,
  Building,
  CheckCircle,
  HelpCircle
} from 'lucide-react'
import { formatCurrency, projectCapital } from '@/lib/helpers'

export default function HomePage() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [role, setRole] = useState<'admin' | 'investor' | 'vendedor'>('investor')
  const [rates, setRates] = useState({ ars: 8.5, usd: 5.0 })
  const [loading, setLoading] = useState(true)

  // Simulator states
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
  const [capital, setCapital] = useState<number>(1000000)

  useEffect(() => {
    const initPage = async () => {
      try {
        const supabase = createClient()
        
        // 1. Fetch yield config (solo las claves públicas)
        const { data: publicSettings } = await supabase.rpc('get_public_settings')

        const val = publicSettings?.monthly_yield_config
        if (val) {
          setRates({
            ars: val.ars_monthly_rate || 8.5,
            usd: val.usd_monthly_rate || 5.0
          })
        }

        // 2. Check auth status
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setIsLoggedIn(true)
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()
          if (profile?.role) {
            setRole(profile.role as any)
          }
        }
      } catch (err) {
        console.error('Error initializing landing page:', err)
      } finally {
        setLoading(false)
      }
    }

    initPage()
  }, [])

  // Calculate projections
  const currentRate = currency === 'ARS' ? rates.ars : rates.usd
  // projectCapital(capital, rate, months) -> returns array of projection objects.
  const projections = [
    { months: 1, label: '1 Mes', colorClass: 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/15' },
    { months: 3, label: '3 Meses', colorClass: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15' },
    { months: 6, label: '6 Meses', colorClass: 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/15' },
    { months: 12, label: '12 Meses', colorClass: 'bg-purple-500/10 border-purple-500/20 text-purple-400 hover:bg-purple-500/15' },
  ].map(p => {
    // Math.pow(1 + rate/100, months)
    const finalCapital = capital * Math.pow(1 + currentRate / 100, p.months)
    const gains = finalCapital - capital
    return {
      ...p,
      finalCapital,
      gains
    }
  })

  const scrollToSimulator = () => {
    document.getElementById('simulador')?.scrollIntoView({ behavior: 'smooth' })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Cargando RENDIMAX...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#080f1a] text-slate-100 flex flex-col selection:bg-blue-500/30 selection:text-blue-300">
      {/* Background gradients for visual depth */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-blue-400/4 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full glass-card border-b border-white/5 px-4 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}
            >
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-widest uppercase gradient-text truncate">
              RENDIMAX
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {isLoggedIn ? (
              <Button
                onClick={() => router.push(role === 'admin' || role === 'vendedor' ? '/admin' : '/portal')}
                className="font-semibold transition-all text-xs sm:text-sm px-3 sm:px-4"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.25)' }}
              >
                <span className="hidden sm:inline">Ir a mi Panel</span>
                <span className="sm:hidden">Mi Panel</span>
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => router.push('/login')}
                  className="text-slate-300 hover:text-white hover:bg-white/5 text-xs sm:text-sm px-2.5 sm:px-4"
                >
                  <LogIn className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">Iniciar Sesión</span>
                  <span className="sr-only sm:hidden">Iniciar Sesión</span>
                </Button>
                <Button
                  onClick={() => router.push('/registro')}
                  className="font-semibold transition-all text-xs sm:text-sm px-3 sm:px-4"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}
                >
                  <UserPlus className="w-4 h-4 mr-1.5" /> Registrarse
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-4 pt-20 pb-16 lg:pt-32 lg:pb-24 max-w-7xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" /> Ecosistema Digital de Inversiones
        </div>
        
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-[1.1] animate-slide-up">
          Multiplicá tu capital con <span className="bg-gradient-to-r from-blue-400 via-sky-300 to-cyan-300 bg-clip-text text-transparent">respaldo real de activos</span>
        </h1>
        
        <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
          Simulá tu rendimiento garantizado por el administrador, autogestioná tus inversiones y firmá tus contratos digitalmente con total transparencia.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <Button 
            onClick={scrollToSimulator}
            className="w-full sm:w-auto font-semibold px-8 py-6 rounded-xl transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 8px 24px rgba(59,130,246,0.2)' }}
          >
            <Calculator className="w-5 h-5" /> Simular Inversión
          </Button>
          <Button 
            variant="outline"
            onClick={() => router.push('/registro')}
            className="w-full sm:w-auto border-white/10 hover:bg-white/5 hover:text-white px-8 py-6 rounded-xl text-slate-300 flex items-center justify-center gap-2"
          >
            Crear Cuenta Gratis <ChevronRight className="w-5 h-5" />
          </Button>
        </div>

        {/* Dynamic highlights */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-16 max-w-4xl mx-auto text-left animate-slide-up" style={{ animationDelay: '0.3s' }}>
          <div className="glass-card p-5 rounded-2xl border border-white/5 hover:border-blue-500/25 transition-all group">
            <div className="text-2xl lg:text-3xl font-bold text-blue-400 group-hover:scale-105 transition-transform">{rates.ars}% mensual</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1.5 font-medium">Tasa de Rendimiento ARS</div>
          </div>
          <div className="glass-card p-5 rounded-2xl border border-white/5 hover:border-blue-500/25 transition-all group">
            <div className="text-2xl lg:text-3xl font-bold text-blue-400 group-hover:scale-105 transition-transform">{rates.usd}% mensual</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1.5 font-medium">Tasa de Rendimiento USD</div>
          </div>
          <div className="glass-card p-5 col-span-2 md:col-span-1 rounded-2xl border border-white/5 hover:border-blue-500/25 transition-all group">
            <div className="text-2xl lg:text-3xl font-bold text-blue-400 group-hover:scale-105 transition-transform">100% Digital</div>
            <div className="text-xs text-slate-400 uppercase tracking-wider mt-1.5 font-medium">Firma de Contrato Online</div>
          </div>
        </div>
      </section>

      {/* Simulator Section */}
      <section id="simulador" className="px-4 py-20 bg-slate-950/40 border-y border-white/5 relative">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold tracking-tight">Simulador de Capital</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              Ingresá el capital que deseas invertir y proyectá tus ganancias mensuales según la tasa garantizada actual
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Input Form Card */}
            <Card className="glass-card border-white/5 lg:col-span-5 p-6 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Seleccionar Moneda</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrency('ARS')}
                      className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                        currency === 'ARS'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-md shadow-blue-500/5'
                          : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300'
                      }`}
                    >
                      Pesos ($ ARS)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrency('USD')}
                      className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all ${
                        currency === 'USD'
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-md shadow-blue-500/5'
                          : 'border-white/5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-300'
                      }`}
                    >
                      Dólares (US$ USD)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="capital-input" className="text-slate-300">Capital Inicial a Invertir</Label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-semibold font-mono">
                      {currency === 'ARS' ? '$' : 'US$'}
                    </span>
                    <Input
                      id="capital-input"
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(Math.max(0, parseInt(e.target.value) || 0))}
                      className="pl-12 bg-white/5 border-white/10 text-white font-mono text-lg py-6 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Rendimiento Mensual Garantizado:</span>
                <span className="text-blue-400 font-bold text-sm">{currentRate}%</span>
              </div>

              <Button
                onClick={() => router.push(`/registro?currency=${currency}&capital=${capital}`)}
                className="w-full font-bold py-6 rounded-xl transition-all flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', boxShadow: '0 4px 14px rgba(59,130,246,0.2)' }}
              >
                Quiero realizar esta inversión <ChevronRight className="w-4 h-4" />
              </Button>
            </Card>

            {/* Projection Results */}
            <div className="lg:col-span-7 space-y-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Proyecciones de Capital Proyectado</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {projections.map((p) => (
                  <div
                    key={p.months}
                    className={`p-6 rounded-2xl border transition-all duration-300 flex flex-col justify-between h-[150px] ${p.colorClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider font-semibold opacity-85">{p.label}</span>
                      <Activity className="w-4 h-4 opacity-60" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-2xl font-extrabold tracking-tight font-mono">
                        {formatCurrency(p.finalCapital, currency)}
                      </div>
                      <div className="text-xs opacity-75 flex justify-between items-center">
                        <span>Interés:</span>
                        <span className="font-semibold font-mono">+{formatCurrency(p.gains, currency)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 leading-normal text-center mt-4">
                * Las proyecciones mostradas calculan interés compuesto mensual en base a la tasa actual del {currentRate}% mensual fijada por el administrador. El rendimiento final acumulado se calcula sobre días corridos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 py-24 max-w-7xl mx-auto space-y-16">
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-bold tracking-tight">Ecosistema Seguro y Autogestionable</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">
            Hemos digitalizado todo el flujo de inversión para brindarte la mayor agilidad sin descuidar el respaldo y la seriedad
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 hover:border-blue-500/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Car className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-bold text-lg">Tasación de Activos</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Tasa un vehículo o propiedad en minutos y presentalo como garantía para tu inversión. Todo mediante WhatsApp directo con el administrador.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 hover:border-blue-500/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-bold text-lg">Contratos Digitales</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Los contratos se autogeneran según la plantilla predefinida y los firmás en la pantalla. Validados con hash SHA-256 e IP de firma.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 hover:border-blue-500/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Coins className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-bold text-lg">Capitalización Compuesta</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Tus inversiones generan intereses compuestos calculados de forma mensual. Cada reinversión acumula los intereses cobrados previamente.
            </p>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4 hover:border-blue-500/20 transition-all">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="font-bold text-lg">Control & Liquidez</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Monitoreá el crecimiento de tus fondos segundo a segundo con el ticker en tiempo real. Solicitá retiros con total libertad.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto py-8 px-4 border-t border-white/5 bg-slate-950/80 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <span className="font-bold text-slate-400 tracking-wider uppercase">RENDIMAX CRM</span>
          </div>
          <p>© 2026 RENDIMAX — Ecosistema Digital de Inversiones. Diseñado por Galu Diseño Web.</p>
        </div>
      </footer>
    </div>
  )
}
