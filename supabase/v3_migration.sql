-- ================================================================
-- FINANPRE CRM v3 — MIGRATION
-- Ejecutar en el Editor SQL de Supabase para aplicar los cambios
-- ================================================================

-- 1. Actualizar el constraint de roles en public.profiles para permitir 'vendedor'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'investor', 'vendedor'));

-- 2. Crear la tabla de anuncios (announcements)
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT CHECK (type IN ('info', 'promo', 'warning')) NOT NULL DEFAULT 'info',
    target_role TEXT NOT NULL DEFAULT 'investor', -- 'investor' o 'all'
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Crear la tabla de configuraciones del sistema (system_settings)
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Agregar columnas adicionales a public.assets_valuation
--    valuation_details: guarda los datos específicos del formulario (JSONB)
--    currency: guarda la moneda de la tasación
ALTER TABLE public.assets_valuation
  ADD COLUMN IF NOT EXISTS valuation_details JSONB,
  ADD COLUMN IF NOT EXISTS currency TEXT CHECK (currency IN ('ARS', 'USD')) DEFAULT 'USD';

-- 5. Habilitar RLS en anuncios y configuraciones
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 6. Recrear y actualizar las políticas RLS

-- Borrar políticas previas sobre profiles para evitar colisiones
DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access to assets_valuation" ON public.assets_valuation;
DROP POLICY IF EXISTS "Admin full access to contracts" ON public.contracts;
DROP POLICY IF EXISTS "Admin full access to credits" ON public.credits;
DROP POLICY IF EXISTS "Admin full access to credit_installments" ON public.credit_installments;
DROP POLICY IF EXISTS "Admin full access to contract_events" ON public.contract_events;
DROP POLICY IF EXISTS "Admin full access to guarantors" ON public.guarantors;
DROP POLICY IF EXISTS "Admin full access to assets_available" ON public.assets_available;
DROP POLICY IF EXISTS "Admin full access to contract_templates" ON public.contract_templates;

DROP POLICY IF EXISTS "Vendedor access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Vendedor access to assets_valuation" ON public.assets_valuation;
DROP POLICY IF EXISTS "Vendedor access to contracts" ON public.contracts;
DROP POLICY IF EXISTS "Vendedor access to credits" ON public.credits;
DROP POLICY IF EXISTS "Vendedor access to credit_installments" ON public.credit_installments;
DROP POLICY IF EXISTS "Vendedor access to contract_events" ON public.contract_events;
DROP POLICY IF EXISTS "Vendedor access to guarantors" ON public.guarantors;
DROP POLICY IF EXISTS "Vendedor access to assets_available" ON public.assets_available;

-- Recrear get_my_role() para estar seguro de su funcionamiento
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Admin: acceso total a todo
CREATE POLICY "Admin full access to profiles" ON public.profiles FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to assets_valuation" ON public.assets_valuation FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to contracts" ON public.contracts FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to credits" ON public.credits FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to credit_installments" ON public.credit_installments FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to contract_events" ON public.contract_events FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to guarantors" ON public.guarantors FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to assets_available" ON public.assets_available FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Admin full access to contract_templates" ON public.contract_templates FOR ALL USING (public.get_my_role() = 'admin');

-- Vendedor RLS Policies
-- Vendedores pueden leer, insertar y actualizar en perfiles, contratos, creditos, cuotas y valuaciones
CREATE POLICY "Vendedor access to profiles" 
ON public.profiles FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to assets_valuation" 
ON public.assets_valuation FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to contracts" 
ON public.contracts FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to credits" 
ON public.credits FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to credit_installments" 
ON public.credit_installments FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to contract_events" 
ON public.contract_events FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to guarantors" 
ON public.guarantors FOR ALL 
USING (public.get_my_role() = 'vendedor') 
WITH CHECK (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor access to assets_available" 
ON public.assets_available FOR SELECT 
USING (public.get_my_role() = 'vendedor');

-- Políticas para Announcements
DROP POLICY IF EXISTS "Admin full access to announcements" ON public.announcements;
DROP POLICY IF EXISTS "Vendedor read announcements" ON public.announcements;
DROP POLICY IF EXISTS "Investor read announcements" ON public.announcements;

CREATE POLICY "Admin full access to announcements" ON public.announcements FOR ALL USING (public.get_my_role() = 'admin');
CREATE POLICY "Vendedor read announcements" ON public.announcements FOR SELECT USING (public.get_my_role() = 'vendedor');
CREATE POLICY "Investor read announcements" ON public.announcements FOR SELECT USING (public.get_my_role() = 'investor' AND active = TRUE);

-- Políticas para System Settings
DROP POLICY IF EXISTS "Anyone can read system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admin full access to system_settings" ON public.system_settings;

CREATE POLICY "Anyone can read system_settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Admin full access to system_settings" ON public.system_settings FOR ALL USING (public.get_my_role() = 'admin');

-- 7. Insertar valores iniciales para tasación (Tucumán, Argentina)
INSERT INTO public.system_settings (key, value)
VALUES (
  'valuation_config',
  '{
    "vehicle": {
      "basePrice": 12000,
      "mileageMultipliers": {
        "under50k": 1.0,
        "under100k": 0.9,
        "under150k": 0.8,
        "over150k": 0.65
      },
      "crashesDiscounts": {
        "none": 0,
        "minor": -1800,
        "major": -4800
      },
      "engineDiscounts": {
        "good": 0,
        "fair": -1200,
        "poor": -3600
      },
      "batteryDiscount": -200
    },
    "realEstate": {
      "zones": {
        "Yerba Buena": 1500,
        "Barrio Norte": 1400,
        "Barrio Sur": 1000,
        "Tafí del Valle": 1200,
        "Tafí Viejo": 700,
        "Banda del Río Salí": 500,
        "El Manantial": 600,
        "Centro / San Miguel": 950,
        "Otras zonas": 450
      },
      "bedroomValue": 6000,
      "bathroomValue": 4000,
      "garageValue": 8000,
      "patioValue": 5000
    }
  }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
