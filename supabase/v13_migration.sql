-- ================================================================
-- RENDIMAX CRM v13 — MIGRATION DE SEGURIDAD
-- Cierra las fugas de datos públicas y mueve las operaciones sensibles
-- del inversor a funciones controladas del servidor.
-- Ejecutar DESPUÉS de v12_migration.sql
-- ================================================================

-- ================================================================
-- 1. FIRMA PÚBLICA POR TOKEN — reemplazo de políticas abiertas por RPC
-- ================================================================
-- Las políticas anteriores usaban `sign_token IS NOT NULL`, condición que
-- cumplen TODOS los contratos: cualquier visitante anónimo podía listar la
-- cartera completa y todos los perfiles. Se eliminan y se reemplazan por dos
-- funciones SECURITY DEFINER que solo devuelven/actualizan el contrato cuyo
-- token exacto se conoce.

DROP POLICY IF EXISTS "Public read contract by token" ON public.contracts;
DROP POLICY IF EXISTS "Public update contract by token" ON public.contracts;
DROP POLICY IF EXISTS "Public read profile linked to contract token" ON public.profiles;

-- Devuelve el contrato a firmar + datos mínimos del firmante + plantilla + datos bancarios
CREATE OR REPLACE FUNCTION public.get_contract_for_signing(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_template JSONB;
  v_is_credit BOOLEAN;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE sign_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_contract.client_id;

  -- Plantilla asignada al contrato
  IF v_contract.template_id IS NOT NULL THEN
    SELECT to_jsonb(t) INTO v_template
    FROM public.contract_templates t
    WHERE t.id = v_contract.template_id;
  END IF;

  -- Fallback: última plantilla activa del tipo que corresponda
  IF v_template IS NULL THEN
    v_is_credit := EXISTS (SELECT 1 FROM public.credits WHERE contract_id = v_contract.id);
    SELECT to_jsonb(t) INTO v_template
    FROM public.contract_templates t
    WHERE t.type = CASE WHEN v_is_credit THEN 'credito' ELSE 'inversion' END
      AND t.is_active = TRUE
    ORDER BY t.version DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'contract', to_jsonb(v_contract),
    'profile', jsonb_build_object(
      'full_name', v_profile.full_name,
      'cuit', v_profile.cuit,
      'address', v_profile.address
    ),
    'template', v_template,
    'bank_details', (SELECT value FROM public.system_settings WHERE key = 'bank_transfer_details')
  );
END;
$$;

-- Registra la firma electrónica del contrato identificado por su token
CREATE OR REPLACE FUNCTION public.sign_contract(
  p_token UUID,
  p_ip TEXT,
  p_hash TEXT,
  p_pdf_url TEXT,
  p_user_agent TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract public.contracts%ROWTYPE;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_contract FROM public.contracts WHERE sign_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contrato inexistente');
  END IF;

  IF v_contract.status NOT IN ('borrador', 'enviado') THEN
    RETURN jsonb_build_object('error', 'El contrato ya fue firmado', 'already_signed', TRUE);
  END IF;

  v_new_status := CASE WHEN v_contract.asset_id IS NOT NULL THEN 'en_consignacion' ELSE 'pendiente_fondos' END;

  UPDATE public.contracts
  SET status = v_new_status,
      contract_signed_at = NOW(),
      signer_ip = p_ip,
      contract_hash = p_hash,
      contract_pdf_url = p_pdf_url
  WHERE id = v_contract.id;

  -- El alta en assets_available la resuelve el trigger handle_contract_asset_available (v9)

  INSERT INTO public.contract_events (contract_id, event_type, ip_address, user_agent, metadata)
  VALUES (
    v_contract.id,
    'signed',
    p_ip,
    p_user_agent,
    jsonb_build_object('hash', p_hash, 'url', p_pdf_url)
  );

  RETURN jsonb_build_object('success', TRUE, 'status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contract_for_signing(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_contract(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ================================================================
-- 2. SYSTEM_SETTINGS — dejar de exponer datos bancarios al público
-- ================================================================
DROP POLICY IF EXISTS "Anyone can read system_settings" ON public.system_settings;

CREATE POLICY "Authenticated users read system_settings"
ON public.system_settings FOR SELECT
TO authenticated
USING (true);

-- Las pantallas públicas (landing y registro) solo necesitan las tasas vigentes
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(key, value),
    '{}'::jsonb
  )
  FROM public.system_settings
  WHERE key IN ('monthly_yield_config', 'valuation_config');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated;

-- ================================================================
-- 3. CONTRATOS DEL INVERSOR — solo lectura desde el navegador
-- ================================================================
-- El alta de inversión autogestionada y la solicitud de retiro pasan a server
-- actions validadas (src/app/portal/actions.ts). Sin estas políticas el cliente
-- ya no puede fijar su propia tasa ni cambiar el estado de sus contratos.

DROP POLICY IF EXISTS "Investor updates own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Investor inserts own contracts" ON public.contracts;

-- ================================================================
-- 4. Índice del token de firma (búsqueda en cada apertura del link)
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_contracts_sign_token ON public.contracts(sign_token);
