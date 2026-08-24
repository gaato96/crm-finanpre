'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { updateMyProfile, changeMyPassword } from './actions'
import {
  User,
  Save,
  Loader2,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react'

type Status = { type: 'success' | 'error'; message: string } | null

function StatusBanner({ status }: { status: Status }) {
  if (!status) return null
  return (
    <div
      className={cn(
        'p-3 rounded-xl border text-sm flex items-start gap-2',
        status.type === 'success'
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          : 'bg-red-500/10 border-red-500/30 text-red-300'
      )}
    >
      {status.type === 'success'
        ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
      <span>{status.message}</span>
    </div>
  )
}

export default function PerfilPage() {
  const { profile, user, loading } = useAuth()

  const [fullName, setFullName] = useState('')
  const [cuit, setCuit] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileStatus, setProfileStatus] = useState<Status>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordStatus, setPasswordStatus] = useState<Status>(null)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name || '')
    setCuit(profile.cuit || '')
    setPhone(profile.phone || '')
    setAddress(profile.address || '')
    setEmail(profile.email || user?.email || '')
  }, [profile, user])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileStatus(null)

    const result = await updateMyProfile({
      full_name: fullName,
      cuit,
      phone,
      address,
      email,
    })

    setSavingProfile(false)

    if (result.error) {
      setProfileStatus({ type: 'error', message: result.error })
      return
    }

    setProfileStatus({
      type: 'success',
      message: 'Datos actualizados. Se aplican en toda la app al recargar.',
    })
    // El contexto de auth cachea el perfil: se recarga para reflejar el cambio
    setTimeout(() => window.location.reload(), 1200)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordStatus(null)

    if (newPassword !== repeatPassword) {
      setPasswordStatus({ type: 'error', message: 'Las contraseñas nuevas no coinciden.' })
      return
    }

    setSavingPassword(true)
    const result = await changeMyPassword(currentPassword, newPassword)
    setSavingPassword(false)

    if (result.error) {
      setPasswordStatus({ type: 'error', message: result.error })
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setRepeatPassword('')
    setPasswordStatus({ type: 'success', message: 'Contraseña actualizada correctamente.' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  const initials = fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'AD'
  const roleLabel = profile?.role === 'vendedor' ? 'Vendedor' : 'Administrador'

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14 border border-primary/30 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold truncate">Mi Cuenta</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
              {roleLabel}
            </Badge>
            <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
          </div>
        </div>
      </div>

      {/* Datos personales */}
      <Card className="glass-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" /> Datos de la cuenta
          </CardTitle>
          <CardDescription className="text-xs">
            Este nombre es el que ven tus clientes en el panel y en las comunicaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="full_name">Nombre y apellido</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  required
                  className="bg-input/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cuit">CUIT</Label>
                <Input
                  id="cuit"
                  value={cuit}
                  onChange={e => setCuit(e.target.value)}
                  required
                  placeholder="20-12345678-9"
                  className="bg-input/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email de acceso</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="bg-input/50"
                />
                <p className="text-[11px] text-muted-foreground">
                  Si lo cambiás, vas a iniciar sesión con el email nuevo.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="3814000000"
                  className="bg-input/50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="address">Domicilio</Label>
              <Input
                id="address"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Av. Aconquija 1200, Yerba Buena"
                className="bg-input/50"
              />
            </div>

            <StatusBanner status={profileStatus} />

            <Button type="submit" disabled={savingProfile} className="gap-2 font-semibold w-full sm:w-auto">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar cambios
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Contraseña */}
      <Card className="glass-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" /> Cambiar contraseña
          </CardTitle>
          <CardDescription className="text-xs">
            Mínimo 10 caracteres. Te pedimos la actual para confirmar que sos vos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="current_password">Contraseña actual</Label>
              <Input
                id="current_password"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-input/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="new_password">Contraseña nueva</Label>
                <Input
                  id="new_password"
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="bg-input/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repeat_password">Repetir contraseña</Label>
                <Input
                  id="repeat_password"
                  type="password"
                  value={repeatPassword}
                  onChange={e => setRepeatPassword(e.target.value)}
                  required
                  minLength={10}
                  autoComplete="new-password"
                  className="bg-input/50"
                />
              </div>
            </div>

            <StatusBanner status={passwordStatus} />

            <Button type="submit" disabled={savingPassword} className="gap-2 font-semibold w-full sm:w-auto">
              {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Actualizar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
