-- ================================================================
-- FINANPRE CRM v2 — MIGRATION
-- Ejecutar DESPUÉS de schema.sql y fix_rls.sql
-- ================================================================

-- 1. Agregar columnas a profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trust_level NUMERIC(2,1) DEFAULT 5.0 CHECK (trust_level BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS client_type TEXT CHECK (client_type IN ('investor', 'borrower', 'both')) DEFAULT 'investor';

-- 2. Agregar columnas a contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS current_capital NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS withdrawal_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS withdrawal_confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS signer_ip TEXT,
  ADD COLUMN IF NOT EXISTS contract_hash TEXT,
  ADD COLUMN IF NOT EXISTS contract_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS sign_token UUID DEFAULT gen_random_uuid();

-- Hacer sign_token único para links de firma
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_sign_token_unique;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_sign_token_unique UNIQUE (sign_token);

-- Actualizar los estados permitidos en contracts
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('borrador', 'enviado', 'pendiente_fondos', 'activo', 'retiro_solicitado', 'retirado', 'reinvertido', 'vencido'));

-- 3. Nueva tabla: contract_events (log de firma)
CREATE TABLE IF NOT EXISTS public.contract_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT CHECK (event_type IN (
    'generated', 'sent', 'viewed', 'signed',
    'withdrawal_requested', 'withdrawal_confirmed',
    'pdf_downloaded', 'funds_confirmed'
  )) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 4. Nueva tabla: guarantors (garantes de créditos)
CREATE TABLE IF NOT EXISTS public.guarantors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_id UUID REFERENCES public.credits(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  dni TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relationship TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 5. Nueva tabla: assets_available (activos disponibles)
CREATE TABLE IF NOT EXISTS public.assets_available (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  asset_valuation_id UUID REFERENCES public.assets_valuation(id),
  title TEXT NOT NULL,
  description TEXT,
  asset_type TEXT CHECK (asset_type IN ('pesos', 'dolares', 'vehiculo', 'inmueble', 'otro')) NOT NULL,
  listed_value NUMERIC(15,2) NOT NULL,
  currency TEXT CHECK (currency IN ('ARS', 'USD')) DEFAULT 'ARS',
  status TEXT CHECK (status IN ('disponible', 'reservado', 'vendido')) DEFAULT 'disponible',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 6. Nueva tabla: contract_templates (plantillas de contratos)
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('inversion', 'credito', 'servicio', 'otro')) NOT NULL DEFAULT 'inversion',
  content TEXT NOT NULL DEFAULT '',
  variables JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 6.5. Agregar template_id a contracts (referencia a contract_templates)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.contract_templates(id);

-- 7. Agregar columnas a credits
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS currency TEXT CHECK (currency IN ('ARS', 'USD')) DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id);

-- ================================================================
-- RLS para nuevas tablas
-- ================================================================

ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guarantors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets_available ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

-- Admin: acceso total a todas las tablas nuevas
CREATE POLICY "Admin full access to contract_events"
ON public.contract_events FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "Admin full access to guarantors"
ON public.guarantors FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "Admin full access to assets_available"
ON public.assets_available FOR ALL USING (public.get_my_role() = 'admin');

CREATE POLICY "Admin full access to contract_templates"
ON public.contract_templates FOR ALL USING (public.get_my_role() = 'admin');

-- Investor: puede ver eventos de sus propios contratos
CREATE POLICY "Investor reads own contract events"
ON public.contract_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contracts
    WHERE contracts.id = contract_events.contract_id
    AND contracts.client_id = auth.uid()
  )
);

-- Investor: puede ver activos disponibles (catálogo público para inversores)
CREATE POLICY "Investor reads available assets"
ON public.assets_available FOR SELECT
USING (true);

-- Firma pública: permite seleccionar y actualizar contrato por token (sin auth)
CREATE POLICY "Public read contract by token"
ON public.contracts FOR SELECT
USING (sign_token IS NOT NULL);

CREATE POLICY "Public update contract by token"
ON public.contracts FOR UPDATE
USING (sign_token IS NOT NULL)
WITH CHECK (sign_token IS NOT NULL);

-- Permitir a usuarios públicos leer perfiles asociados a un contrato con token de firma
CREATE POLICY "Public read profile linked to contract token"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.contracts
    WHERE contracts.client_id = profiles.id
    AND contracts.sign_token IS NOT NULL
  )
);


-- ================================================================
-- Plantilla de contrato por defecto (inversión)
-- ================================================================

INSERT INTO public.contract_templates (name, type, content, variables)
VALUES (
  'Contrato de Inversión Estándar',
  'inversion',
  '<div class="contract">
  <h1>CONTRATO DE INVERSIÓN</h1>
  <p><strong>Fecha:</strong> {{fecha_contrato}}</p>
  
  <h2>PARTES</h2>
  <p><strong>INVERSOR:</strong> {{nombre_cliente}}, DNI {{dni_cliente}}, con domicilio en {{domicilio_cliente}}.</p>
  <p><strong>FINANCIERA:</strong> FinanPre, representada por sus administradores legales.</p>
  
  <h2>OBJETO DEL CONTRATO</h2>
  <p>El INVERSOR aporta la suma de <strong>{{moneda}} {{monto_inicial}}</strong> ({{monto_letras}}) en concepto de capital de inversión, 
  sobre el cual se aplicará una tasa de interés mensual del <strong>{{tasa_mensual}}%</strong>, con capitalización cada 30 días.</p>
  
  <h2>PLAZO Y CONDICIONES</h2>
  <p>La inversión tiene inicio el <strong>{{fecha_inicio}}</strong>. El capital invertido permanecerá reinvertido de forma automática, 
  generando interés compuesto mensual, hasta que el INVERSOR solicite el retiro a través del portal digital.</p>
  
  <h2>FORMA DE PAGO Y RETIRO</h2>
  <p>El INVERSOR podrá solicitar el retiro de su capital e intereses acumulados en cualquier momento, 
  a través de su panel de acceso. FinanPre procesará el retiro dentro de las 48 horas hábiles siguientes 
  a la confirmación de la solicitud.</p>
  
  <h2>CLÁUSULA DE PROTECCIÓN DE DATOS</h2>
  <p>Los datos personales del INVERSOR son tratados conforme a la Ley 25.326 de Protección de Datos Personales. 
  FinanPre se compromete a no divulgar, vender ni ceder dichos datos a terceros sin consentimiento expreso.</p>
  
  <h2>FIRMA ELECTRÓNICA</h2>
  <p>Las partes acuerdan que la firma electrónica tiene plena validez conforme a la Ley 25.506 de Firma Digital. 
  El INVERSOR acepta expresamente el medio electrónico como válido para la formalización del presente contrato.</p>
  
  <p class="signature-notice">Firmado digitalmente por <strong>{{nombre_cliente}}</strong> (DNI: {{dni_cliente}}) 
  el día {{fecha_firma}} a las {{hora_firma}} desde IP {{ip_firma}}.</p>
</div>',
  '["fecha_contrato","nombre_cliente","dni_cliente","domicilio_cliente","moneda","monto_inicial","monto_letras","tasa_mensual","fecha_inicio","fecha_firma","hora_firma","ip_firma"]'
)
ON CONFLICT DO NOTHING;

-- ================================================================
-- BUCKET DE STORAGE PARA CONTRATOS
-- ================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir a usuarios autenticados (admin) y públicos leer del bucket contracts si tienen el link
CREATE POLICY "Public read access to contracts bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'contracts');

CREATE POLICY "Public insert access to contracts bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'contracts');

-- ================================================================
-- VERIFICACIÓN
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' ORDER BY table_name;
-- ================================================================

-- ================================================================
-- RONDA 3: Columnas de Interés Moratorio y Control de Pagos
-- ================================================================
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS daily_late_interest_rate NUMERIC(5,2) DEFAULT 0.0;

ALTER TABLE public.credit_installments
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS late_interest NUMERIC(15,2) DEFAULT 0.0;

