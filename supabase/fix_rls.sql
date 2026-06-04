-- ================================================================
-- FINANPRE — FIX RLS RECURSION BUG
-- 
-- PROBLEMA: La política "Admin full access to profiles" hacía un
-- SELECT sobre public.profiles (la misma tabla que protege), 
-- causando recursión infinita en Postgres. El resultado era que
-- los admins no podían leer su propio perfil → profile = null
-- → siempre redirigía al portal de inversores.
--
-- SOLUCIÓN: Usamos una función SECURITY DEFINER que corre con
-- privilegios de superusuario, evitando el loop de RLS.
-- ================================================================

-- 1. Crear función auxiliar que lee el rol del usuario actual
--    SIN pasar por RLS (SECURITY DEFINER = corre como el owner)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ================================================================
-- 2. Eliminar las políticas antiguas (con recursión)
-- ================================================================

DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access to assets_valuation" ON public.assets_valuation;
DROP POLICY IF EXISTS "Admin full access to contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admin full access to credits" ON public.credits;
DROP POLICY IF EXISTS "Admin full access to credit_installments" ON public.credit_installments;

-- ================================================================
-- 3. Recrear políticas de admin usando la función sin recursión
-- ================================================================

-- Profiles: Admin lee y modifica todos los perfiles
CREATE POLICY "Admin full access to profiles"
ON public.profiles FOR ALL
USING (public.get_my_role() = 'admin');

-- Assets Valuation
CREATE POLICY "Admin full access to assets_valuation"
ON public.assets_valuation FOR ALL
USING (public.get_my_role() = 'admin');

-- Contracts
CREATE POLICY "Admin full access to contracts"
ON public.contracts FOR ALL
USING (public.get_my_role() = 'admin');

-- Credits
CREATE POLICY "Admin full access to credits"
ON public.credits FOR ALL
USING (public.get_my_role() = 'admin');

-- Credit Installments
CREATE POLICY "Admin full access to credit_installments"
ON public.credit_installments FOR ALL
USING (public.get_my_role() = 'admin');

-- ================================================================
-- VERIFICACIÓN: Después de ejecutar, corré este query para
-- confirmar que los admins pueden leer perfiles:
-- SELECT id, full_name, role FROM public.profiles;
-- (Ejecutalo logueado como admin en el Dashboard de Supabase)
-- ================================================================
