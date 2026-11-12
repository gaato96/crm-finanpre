-- ================================================================
-- RENDIMAX CRM v15 — SEPARACIÓN INVERSIÓN/CRÉDITO, LIBRO MAYOR,
-- AUTOMATIZACIONES PROGRAMADAS Y OPERACIONES TRANSACCIONALES
-- Ejecutar DESPUÉS de v14_migration.sql
-- ================================================================
-- Resuelve:
--  1. Los créditos generaban filas en `contracts` sin distinguirse de las
--     inversiones: el deudor veía su préstamo como inversión propia en el portal.
--  2. No existía ningún job: la reinversión automática documentada nunca corría,
--     ningún contrato pasaba a 'vencido' y `credits.status = 'moroso'` no se
--     escribía nunca (el KPI de morosidad era siempre 0).
--  3. El alta de crédito eran 3 INSERT sueltos sin transacción.
--  4. La confirmación de retiro no registraba el monto pagado: no había forma
--     de auditar la plata que salió.
--  5. Un vendedor podía borrar un contrato activo firmado y su historial.
--  6. La firma registraba una IP que mandaba el propio navegador (falsificable)
--     y un hash irreproducible. El bucket de contratos era público.
-- ================================================================


-- ================================================================
-- 1. DISCRIMINADOR INVERSIÓN / CRÉDITO EN `contracts`
-- ================================================================
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'inversion';

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_kind_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_kind_check
  CHECK (kind IN ('inversion', 'credito'));

-- Backfill: todo contrato referenciado por un crédito es un contrato de crédito
UPDATE public.contracts c
SET kind = 'credito'
WHERE EXISTS (SELECT 1 FROM public.credits k WHERE k.contract_id = c.id)
  AND c.kind <> 'credito';

CREATE INDEX IF NOT EXISTS idx_contracts_kind_status
  ON public.contracts(kind, status);

-- El trigger que publica el activo en `assets_available` sólo debe correr para
-- inversiones: en un crédito el activo se está financiando, no recibiendo.
CREATE OR REPLACE FUNCTION public.handle_contract_asset_available()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asset_type TEXT;
  v_description TEXT;
  v_market_value NUMERIC;
  v_currency TEXT;
  v_client_name TEXT;
  v_exists BOOLEAN;
BEGIN
  IF NEW.kind <> 'inversion' THEN
    RETURN NEW;
  END IF;

  IF NEW.asset_id IS NOT NULL AND NEW.status IN ('en_consignacion', 'activo') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.assets_available WHERE asset_valuation_id = NEW.asset_id
    ) INTO v_exists;

    IF NOT v_exists THEN
      SELECT asset_type, description, market_value, currency
        INTO v_asset_type, v_description, v_market_value, v_currency
      FROM public.assets_valuation
      WHERE id = NEW.asset_id;

      SELECT full_name INTO v_client_name
      FROM public.profiles WHERE id = NEW.client_id;

      INSERT INTO public.assets_available (
        asset_valuation_id, title, description, asset_type,
        listed_value, currency, status
      ) VALUES (
        NEW.asset_id,
        COALESCE(UPPER(LEFT(v_asset_type, 1)) || SUBSTRING(v_asset_type FROM 2), 'Activo')
          || ' - ' || COALESCE(v_description, ''),
        'Recibido como forma de pago / inversión de ' || COALESCE(v_client_name, 'cliente') || '.',
        COALESCE(v_asset_type, 'otro'),
        COALESCE(v_market_value, 0),
        COALESCE(v_currency, 'ARS'),
        'disponible'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


-- ================================================================
-- 2. LIBRO MAYOR DE MOVIMIENTOS
-- ================================================================
-- Antes no quedaba registro del dinero que entraba y salía: confirmar un retiro
-- sólo cambiaba un estado. Sin asientos no se puede auditar ni cerrar un mes.
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  concept TEXT NOT NULL CHECK (concept IN (
    'aporte_inversion', 'retiro_inversion', 'desembolso_credito',
    'cobro_cuota', 'cobro_mora', 'cancelacion_credito', 'ajuste'
  )),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('ARS', 'USD')),
  client_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  credit_id UUID REFERENCES public.credits(id) ON DELETE SET NULL,
  installment_id UUID REFERENCES public.credit_installments(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON public.ledger_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_client ON public.ledger_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_concept ON public.ledger_entries(concept);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to ledger_entries" ON public.ledger_entries;
CREATE POLICY "Admin full access to ledger_entries"
ON public.ledger_entries FOR ALL USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Vendedor lee ledger_entries" ON public.ledger_entries;
CREATE POLICY "Vendedor lee ledger_entries"
ON public.ledger_entries FOR SELECT USING (public.get_my_role() = 'vendedor');

DROP POLICY IF EXISTS "Inversor lee sus movimientos" ON public.ledger_entries;
CREATE POLICY "Inversor lee sus movimientos"
ON public.ledger_entries FOR SELECT USING (client_id = auth.uid());

REVOKE ALL ON public.ledger_entries FROM anon;


-- ================================================================
-- 3. UN VENDEDOR NO PUEDE BORRAR CONTRATOS, CRÉDITOS NI CUOTAS
-- ================================================================
-- Las políticas eran FOR ALL: un vendedor podía borrar una inversión activa
-- firmada junto con todo su historial de eventos.
DROP POLICY IF EXISTS "Vendedor access to contracts" ON public.contracts;
DROP POLICY IF EXISTS "Vendedor lee contratos" ON public.contracts;
CREATE POLICY "Vendedor lee contratos"
ON public.contracts FOR SELECT USING (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor crea contratos" ON public.contracts;
CREATE POLICY "Vendedor crea contratos"
ON public.contracts FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor edita contratos" ON public.contracts;
CREATE POLICY "Vendedor edita contratos"
ON public.contracts FOR UPDATE
USING (public.get_my_role() = 'vendedor')
WITH CHECK (public.get_my_role() = 'vendedor');
-- (sin política de DELETE: sólo el administrador puede borrar)

DROP POLICY IF EXISTS "Vendedor access to credits" ON public.credits;
DROP POLICY IF EXISTS "Vendedor lee creditos" ON public.credits;
CREATE POLICY "Vendedor lee creditos"
ON public.credits FOR SELECT USING (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor crea creditos" ON public.credits;
CREATE POLICY "Vendedor crea creditos"
ON public.credits FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor edita creditos" ON public.credits;
CREATE POLICY "Vendedor edita creditos"
ON public.credits FOR UPDATE
USING (public.get_my_role() = 'vendedor')
WITH CHECK (public.get_my_role() = 'vendedor');

DROP POLICY IF EXISTS "Vendedor access to credit_installments" ON public.credit_installments;
DROP POLICY IF EXISTS "Vendedor lee cuotas" ON public.credit_installments;
CREATE POLICY "Vendedor lee cuotas"
ON public.credit_installments FOR SELECT USING (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor crea cuotas" ON public.credit_installments;
CREATE POLICY "Vendedor crea cuotas"
ON public.credit_installments FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor edita cuotas" ON public.credit_installments;
CREATE POLICY "Vendedor edita cuotas"
ON public.credit_installments FOR UPDATE
USING (public.get_my_role() = 'vendedor')
WITH CHECK (public.get_my_role() = 'vendedor');

DROP POLICY IF EXISTS "Vendedor access to contract_events" ON public.contract_events;
DROP POLICY IF EXISTS "Vendedor lee eventos" ON public.contract_events;
CREATE POLICY "Vendedor lee eventos"
ON public.contract_events FOR SELECT USING (public.get_my_role() = 'vendedor');
DROP POLICY IF EXISTS "Vendedor crea eventos" ON public.contract_events;
CREATE POLICY "Vendedor crea eventos"
ON public.contract_events FOR INSERT WITH CHECK (public.get_my_role() = 'vendedor');


-- ================================================================
-- 4. ALTA DE CRÉDITO TRANSACCIONAL
-- ================================================================
-- Antes eran 3 INSERT sueltos (contracts → credits → credit_installments): si
-- fallaba el último quedaba un crédito sin cuotas y un contrato huérfano.
-- Una función plpgsql corre en una sola transacción: o entra todo, o nada.
CREATE OR REPLACE FUNCTION public.create_credit_with_schedule(
  p_client_id UUID,
  p_total NUMERIC,
  p_rate NUMERIC,
  p_installments INTEGER,
  p_currency TEXT,
  p_credit_type TEXT,
  p_first_due_date DATE,
  p_late_rate NUMERIC,
  p_template_id UUID,
  p_available_asset_id UUID,
  p_schedule JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_contract_id UUID;
  v_credit_id UUID;
  v_asset_valuation_id UUID;
  v_last_due DATE;
  v_count INTEGER;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'Sólo el personal autorizado puede otorgar créditos';
  END IF;

  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'El capital prestado debe ser mayor a cero';
  END IF;
  IF p_installments IS NULL OR p_installments <= 0 OR p_installments > 120 THEN
    RAISE EXCEPTION 'La cantidad de cuotas debe estar entre 1 y 120';
  END IF;
  IF p_schedule IS NULL OR jsonb_array_length(p_schedule) = 0 THEN
    RAISE EXCEPTION 'El plan de cuotas está vacío';
  END IF;
  IF jsonb_array_length(p_schedule) <> p_installments THEN
    RAISE EXCEPTION 'El plan de cuotas no coincide con la cantidad declarada';
  END IF;

  SELECT MAX((item->>'due_date')::DATE) INTO v_last_due
  FROM jsonb_array_elements(p_schedule) AS item;

  -- Activo financiado (si corresponde)
  IF p_available_asset_id IS NOT NULL THEN
    SELECT asset_valuation_id INTO v_asset_valuation_id
    FROM public.assets_available WHERE id = p_available_asset_id;
  END IF;

  -- 1. Contrato del crédito (kind = 'credito': no aparece como inversión)
  INSERT INTO public.contracts (
    client_id, asset_id, initial_capital, current_capital, currency,
    monthly_rate, start_date, end_date, status, template_id, kind
  ) VALUES (
    p_client_id, v_asset_valuation_id, p_total, p_total, p_currency,
    p_rate, CURRENT_DATE, v_last_due, 'enviado', p_template_id, 'credito'
  )
  RETURNING id INTO v_contract_id;

  -- 2. Crédito
  INSERT INTO public.credits (
    client_id, total_amount, interest_rate, total_installments, status,
    contract_id, daily_late_interest_rate, currency, credit_type,
    first_due_date, payment_day
  ) VALUES (
    p_client_id, p_total, p_rate, p_installments, 'vigente',
    v_contract_id, COALESCE(p_late_rate, 0), p_currency, p_credit_type,
    p_first_due_date, EXTRACT(DAY FROM p_first_due_date)::INTEGER
  )
  RETURNING id INTO v_credit_id;

  -- 3. Cuotas
  INSERT INTO public.credit_installments (
    credit_id, installment_number, amount, principal_amount, interest_amount,
    is_interest_only, due_date, status, late_interest
  )
  SELECT
    v_credit_id,
    (item->>'installment_number')::INTEGER,
    (item->>'amount')::NUMERIC,
    (item->>'principal_amount')::NUMERIC,
    (item->>'interest_amount')::NUMERIC,
    COALESCE((item->>'is_interest_only')::BOOLEAN, FALSE),
    (item->>'due_date')::DATE,
    'pendiente',
    0
  FROM jsonb_array_elements(p_schedule) AS item;

  SELECT COUNT(*) INTO v_count FROM public.credit_installments WHERE credit_id = v_credit_id;
  IF v_count <> p_installments THEN
    RAISE EXCEPTION 'No se generaron todas las cuotas (% de %)', v_count, p_installments;
  END IF;

  -- 4. Activo financiado: sale del catálogo
  IF p_available_asset_id IS NOT NULL THEN
    UPDATE public.assets_available SET status = 'vendido' WHERE id = p_available_asset_id;
    IF v_asset_valuation_id IS NOT NULL THEN
      UPDATE public.assets_valuation SET status = 'financiado' WHERE id = v_asset_valuation_id;
    END IF;
  END IF;

  -- 5. Asiento del desembolso
  INSERT INTO public.ledger_entries (
    direction, concept, amount, currency, client_id, contract_id, credit_id, notes, created_by
  ) VALUES (
    'out', 'desembolso_credito', p_total, p_currency, p_client_id,
    v_contract_id, v_credit_id,
    'Otorgamiento de crédito ' || p_credit_type, auth.uid()
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'credit_id', v_credit_id,
    'contract_id', v_contract_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_credit_with_schedule(
  UUID, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, DATE, NUMERIC, UUID, UUID, JSONB
) TO authenticated;


-- ================================================================
-- 5. COBRO DE CUOTA Y CANCELACIÓN CON ASIENTO CONTABLE
-- ================================================================
CREATE OR REPLACE FUNCTION public.collect_installment(
  p_installment_id UUID,
  p_late_interest NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_inst public.credit_installments%ROWTYPE;
  v_credit public.credits%ROWTYPE;
  v_total NUMERIC;
  v_pending INTEGER;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'Sólo el personal autorizado puede registrar cobros';
  END IF;

  SELECT * INTO v_inst FROM public.credit_installments WHERE id = p_installment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'La cuota no existe');
  END IF;
  IF v_inst.status = 'pagado' THEN
    RETURN jsonb_build_object('error', 'La cuota ya figura cobrada');
  END IF;

  SELECT * INTO v_credit FROM public.credits WHERE id = v_inst.credit_id;
  v_total := v_inst.amount + COALESCE(p_late_interest, 0);

  UPDATE public.credit_installments
  SET status = 'pagado',
      paid_at = NOW(),
      late_interest = COALESCE(p_late_interest, 0),
      paid_amount = v_total
  WHERE id = p_installment_id;

  INSERT INTO public.ledger_entries (
    direction, concept, amount, currency, client_id, credit_id, installment_id, notes, created_by
  ) VALUES (
    'in', 'cobro_cuota', v_inst.amount, COALESCE(v_credit.currency, 'ARS'),
    v_credit.client_id, v_credit.id, p_installment_id,
    'Cuota ' || v_inst.installment_number, auth.uid()
  );

  IF COALESCE(p_late_interest, 0) > 0 THEN
    INSERT INTO public.ledger_entries (
      direction, concept, amount, currency, client_id, credit_id, installment_id, notes, created_by
    ) VALUES (
      'in', 'cobro_mora', p_late_interest, COALESCE(v_credit.currency, 'ARS'),
      v_credit.client_id, v_credit.id, p_installment_id,
      'Interés punitorio cuota ' || v_inst.installment_number, auth.uid()
    );
  END IF;

  -- En cuotas fijas/decrecientes el crédito se finaliza solo al no quedar pendientes
  IF v_credit.credit_type <> 'refinanciacion' THEN
    SELECT COUNT(*) INTO v_pending
    FROM public.credit_installments
    WHERE credit_id = v_credit.id AND status <> 'pagado';

    IF v_pending = 0 THEN
      UPDATE public.credits SET status = 'finalizado' WHERE id = v_credit.id;
      UPDATE public.contracts SET status = 'retirado'
      WHERE id = v_credit.contract_id AND kind = 'credito';
    ELSE
      -- Si venía marcado moroso y ya no hay cuotas vencidas, vuelve a vigente
      SELECT COUNT(*) INTO v_pending
      FROM public.credit_installments
      WHERE credit_id = v_credit.id AND status <> 'pagado' AND due_date < CURRENT_DATE;
      IF v_pending = 0 AND v_credit.status = 'moroso' THEN
        UPDATE public.credits SET status = 'vigente' WHERE id = v_credit.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_installment(UUID, NUMERIC) TO authenticated;


-- Revertir un cobro mal registrado (sólo administrador)
CREATE OR REPLACE FUNCTION public.revert_installment_payment(p_installment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst public.credit_installments%ROWTYPE;
  v_credit public.credits%ROWTYPE;
BEGIN
  IF public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Sólo un administrador puede revertir un cobro';
  END IF;

  SELECT * INTO v_inst FROM public.credit_installments WHERE id = p_installment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'La cuota no existe');
  END IF;
  IF v_inst.status <> 'pagado' THEN
    RETURN jsonb_build_object('error', 'La cuota no está cobrada');
  END IF;
  IF v_inst.is_payoff THEN
    RETURN jsonb_build_object('error', 'Una cancelación total no se revierte desde acá');
  END IF;

  SELECT * INTO v_credit FROM public.credits WHERE id = v_inst.credit_id;

  UPDATE public.credit_installments
  SET status = CASE WHEN due_date < CURRENT_DATE THEN 'vencido' ELSE 'pendiente' END,
      paid_at = NULL,
      paid_amount = NULL,
      late_interest = 0
  WHERE id = p_installment_id;

  -- Asiento inverso: el libro mayor nunca se borra, se compensa
  INSERT INTO public.ledger_entries (
    direction, concept, amount, currency, client_id, credit_id, installment_id, notes, created_by
  ) VALUES (
    'out', 'ajuste', COALESCE(v_inst.paid_amount, v_inst.amount),
    COALESCE(v_credit.currency, 'ARS'), v_credit.client_id, v_credit.id, p_installment_id,
    'Reversión del cobro de la cuota ' || v_inst.installment_number, auth.uid()
  );

  UPDATE public.credits SET status = 'vigente'
  WHERE id = v_credit.id AND status = 'finalizado';

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_installment_payment(UUID) TO authenticated;


-- Cancelación total de una refinanciación, en una sola transacción
CREATE OR REPLACE FUNCTION public.payoff_credit(p_credit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_credit public.credits%ROWTYPE;
  v_payoff NUMERIC;
  v_next INTEGER;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'Sólo el personal autorizado puede cancelar un crédito';
  END IF;

  SELECT * INTO v_credit FROM public.credits WHERE id = p_credit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'El crédito no existe');
  END IF;
  IF v_credit.status = 'finalizado' THEN
    RETURN jsonb_build_object('error', 'El crédito ya está finalizado');
  END IF;

  v_payoff := ROUND(v_credit.total_amount * (1 + v_credit.interest_rate / 100.0), 2);

  SELECT COALESCE(MAX(installment_number), 0) + 1 INTO v_next
  FROM public.credit_installments WHERE credit_id = p_credit_id;

  INSERT INTO public.credit_installments (
    credit_id, installment_number, amount, principal_amount, interest_amount,
    is_interest_only, is_payoff, due_date, status, paid_at, paid_amount, late_interest
  ) VALUES (
    p_credit_id, v_next, v_payoff, v_credit.total_amount,
    v_payoff - v_credit.total_amount, FALSE, TRUE,
    CURRENT_DATE, 'pagado', NOW(), v_payoff, 0
  );

  DELETE FROM public.credit_installments
  WHERE credit_id = p_credit_id AND status <> 'pagado';

  UPDATE public.credits
  SET status = 'finalizado', payoff_amount = v_payoff, payoff_at = NOW()
  WHERE id = p_credit_id;

  UPDATE public.contracts SET status = 'retirado'
  WHERE id = v_credit.contract_id AND kind = 'credito';

  INSERT INTO public.ledger_entries (
    direction, concept, amount, currency, client_id, credit_id, notes, created_by
  ) VALUES (
    'in', 'cancelacion_credito', v_payoff, COALESCE(v_credit.currency, 'ARS'),
    v_credit.client_id, p_credit_id, 'Cancelación total de la deuda', auth.uid()
  );

  RETURN jsonb_build_object('success', TRUE, 'payoff', v_payoff);
END;
$$;

GRANT EXECUTE ON FUNCTION public.payoff_credit(UUID) TO authenticated;


-- ================================================================
-- 6. CONFIRMACIÓN DE FONDOS Y DE RETIRO CON MONTO REGISTRADO
-- ================================================================
CREATE OR REPLACE FUNCTION public.confirm_contract_funds(p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_contract public.contracts%ROWTYPE;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'Sólo el personal autorizado puede confirmar fondos';
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'El contrato no existe');
  END IF;
  IF v_contract.status NOT IN ('pendiente_fondos', 'en_consignacion', 'enviado', 'borrador') THEN
    RETURN jsonb_build_object('error', 'Este contrato no está esperando acreditación');
  END IF;

  UPDATE public.contracts SET status = 'activo' WHERE id = p_contract_id;

  INSERT INTO public.contract_events (contract_id, event_type, metadata)
  VALUES (p_contract_id, 'funds_confirmed',
          jsonb_build_object('confirmed_at', NOW(), 'by', auth.uid()));

  IF v_contract.kind = 'inversion' THEN
    INSERT INTO public.ledger_entries (
      direction, concept, amount, currency, client_id, contract_id, notes, created_by
    ) VALUES (
      'in', 'aporte_inversion', v_contract.initial_capital, v_contract.currency,
      v_contract.client_id, p_contract_id, 'Acreditación del capital invertido', auth.uid()
    );
  END IF;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_contract_funds(UUID) TO authenticated;


-- Capital devengado de un contrato a una fecha, topeado en su vencimiento.
-- Antes el front calculaba interés compuesto sin tope: un contrato 'activo'
-- pasado de fecha seguía capitalizando para siempre.
CREATE OR REPLACE FUNCTION public.contract_accrued_capital(
  p_contract_id UUID,
  p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(
    c.initial_capital * POWER(
      1 + (c.monthly_rate / 100.0),
      GREATEST(0, LEAST(
        EXTRACT(EPOCH FROM (p_at - c.start_date::TIMESTAMPTZ)) / 86400.0,
        (c.end_date - c.start_date)::NUMERIC
      )) / 30.0
    ), 2)
  FROM public.contracts c
  WHERE c.id = p_contract_id;
$$;

GRANT EXECUTE ON FUNCTION public.contract_accrued_capital(UUID, TIMESTAMPTZ) TO authenticated;


CREATE OR REPLACE FUNCTION public.confirm_withdrawal(
  p_contract_id UUID,
  p_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_contract public.contracts%ROWTYPE;
  v_paid NUMERIC;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'Sólo el personal autorizado puede confirmar un retiro';
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'El contrato no existe');
  END IF;
  IF v_contract.status <> 'retiro_solicitado' THEN
    RETURN jsonb_build_object('error', 'Este contrato no tiene un retiro pendiente');
  END IF;

  v_paid := COALESCE(p_amount, public.contract_accrued_capital(p_contract_id));

  UPDATE public.contracts
  SET status = 'retirado',
      withdrawal_confirmed_at = NOW(),
      current_capital = v_paid
  WHERE id = p_contract_id;

  INSERT INTO public.contract_events (contract_id, event_type, metadata)
  VALUES (p_contract_id, 'withdrawal_confirmed',
          jsonb_build_object('amount', v_paid, 'confirmed_at', NOW(), 'by', auth.uid()));

  INSERT INTO public.ledger_entries (
    direction, concept, amount, currency, client_id, contract_id, notes, created_by
  ) VALUES (
    'out', 'retiro_inversion', v_paid, v_contract.currency,
    v_contract.client_id, p_contract_id, 'Pago de capital e intereses al inversor', auth.uid()
  );

  RETURN jsonb_build_object('success', TRUE, 'amount', v_paid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_withdrawal(UUID, NUMERIC) TO authenticated;


-- Activar una consignación conservando los términos pactados.
-- La versión anterior sobrescribía start_date/end_date con hoy/+30 y perdía
-- el plazo original del contrato.
CREATE OR REPLACE FUNCTION public.activate_consignment(p_contract_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_contract public.contracts%ROWTYPE;
  v_duration INTEGER;
  v_start DATE;
  v_end DATE;
BEGIN
  v_role := public.get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'vendedor') THEN
    RAISE EXCEPTION 'Sólo el personal autorizado puede activar una consignación';
  END IF;

  SELECT * INTO v_contract FROM public.contracts WHERE id = p_contract_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'El contrato no existe');
  END IF;
  IF v_contract.status <> 'en_consignacion' THEN
    RETURN jsonb_build_object('error', 'Este contrato no está en consignación');
  END IF;

  -- Se respeta el plazo pactado; el período arranca al cerrar la consignación
  v_duration := GREATEST(1, (v_contract.end_date - v_contract.start_date));
  v_start := GREATEST(COALESCE(v_contract.consignacion_fin, CURRENT_DATE), CURRENT_DATE);
  v_end := v_start + v_duration;

  IF EXTRACT(ISODOW FROM v_end) = 6 THEN v_end := v_end + 2;
  ELSIF EXTRACT(ISODOW FROM v_end) = 7 THEN v_end := v_end + 1;
  END IF;

  UPDATE public.contracts
  SET status = 'activo', start_date = v_start, end_date = v_end
  WHERE id = p_contract_id;

  INSERT INTO public.contract_events (contract_id, event_type, metadata)
  VALUES (p_contract_id, 'funds_confirmed',
          jsonb_build_object(
            'activated_at', NOW(), 'by', auth.uid(),
            'start_date', v_start, 'end_date', v_end,
            'kept_duration_days', v_duration
          ));

  INSERT INTO public.ledger_entries (
    direction, concept, amount, currency, client_id, contract_id, notes, created_by
  ) VALUES (
    'in', 'aporte_inversion', v_contract.initial_capital, v_contract.currency,
    v_contract.client_id, p_contract_id, 'Cierre de consignación: activo recibido', auth.uid()
  );

  RETURN jsonb_build_object('success', TRUE, 'start_date', v_start, 'end_date', v_end);
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_consignment(UUID) TO authenticated;


-- ================================================================
-- 7. FIRMA ELECTRÓNICA CON IP Y HASH DEL SERVIDOR
-- ================================================================
-- La IP la mandaba el navegador (api.ipify.org) y era falsificable; el hash se
-- calculaba sobre un HTML irreproducible. Ahora firma y subida del PDF pasan
-- por una server action que lee la IP de los headers del request y hashea los
-- bytes del PDF. Se revoca el acceso anónimo a las RPC.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_hash TEXT,
  ADD COLUMN IF NOT EXISTS signed_user_agent TEXT;

REVOKE EXECUTE ON FUNCTION public.get_contract_for_signing(UUID) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sign_contract(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;

-- Versión que recibe la ruta del PDF en Storage y el hash de sus bytes
CREATE OR REPLACE FUNCTION public.sign_contract_v2(
  p_token UUID,
  p_ip TEXT,
  p_pdf_hash TEXT,
  p_pdf_path TEXT,
  p_signature_hash TEXT,
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

  v_new_status := CASE
    WHEN v_contract.asset_id IS NOT NULL AND v_contract.kind = 'inversion' THEN 'en_consignacion'
    ELSE 'pendiente_fondos'
  END;

  UPDATE public.contracts
  SET status = v_new_status,
      contract_signed_at = NOW(),
      signer_ip = p_ip,
      contract_hash = p_pdf_hash,
      contract_pdf_path = p_pdf_path,
      signature_image_hash = p_signature_hash,
      signed_user_agent = p_user_agent
  WHERE id = v_contract.id;

  INSERT INTO public.contract_events (contract_id, event_type, ip_address, user_agent, metadata)
  VALUES (
    v_contract.id, 'signed', p_ip, p_user_agent,
    jsonb_build_object(
      'pdf_sha256', p_pdf_hash,
      'pdf_path', p_pdf_path,
      'signature_sha256', p_signature_hash,
      'ip_source', 'request_headers'
    )
  );

  RETURN jsonb_build_object('success', TRUE, 'status', v_new_status, 'contract_id', v_contract.id);
END;
$$;

-- Sólo la clave de servicio (server actions ya validadas) puede ejecutarla
REVOKE EXECUTE ON FUNCTION public.sign_contract_v2(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon, authenticated;

-- Bucket privado: el PDF firmado dejaba de requerir autenticación una vez
-- conocida la URL. Se sirve con URLs firmadas de duración corta.
UPDATE storage.buckets SET public = FALSE WHERE id = 'contracts';

DROP POLICY IF EXISTS "Public read access to contracts bucket" ON storage.objects;
DROP POLICY IF EXISTS "Subida del PDF de un contrato pendiente de firma" ON storage.objects;

DROP POLICY IF EXISTS "Personal lee PDFs de contratos" ON storage.objects;
CREATE POLICY "Personal lee PDFs de contratos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'contracts' AND public.get_my_role() IN ('admin', 'vendedor'));

DROP POLICY IF EXISTS "Inversor lee el PDF de sus contratos" ON storage.objects;
CREATE POLICY "Inversor lee el PDF de sus contratos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.client_id = auth.uid()
      AND storage.objects.name IN (c.contract_pdf_path, c.id::text || '_signed.pdf')
  )
);


-- ================================================================
-- 8. JOBS DIARIOS
-- ================================================================
-- Nada de esto corría: la reinversión automática documentada era inexistente,
-- ningún contrato pasaba a 'vencido' y 'moroso' no se escribía nunca.

/** Días de atraso a partir de los cuales un crédito se marca moroso. */
CREATE OR REPLACE FUNCTION public.rendimax_late_threshold_days()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value->>'late_threshold_days')::INTEGER, 10)
  FROM public.system_settings WHERE key = 'automation_config';
$$;

INSERT INTO public.system_settings (key, value, updated_at)
VALUES ('automation_config', '{"late_threshold_days": 10, "auto_reinvest": true}'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;


-- Reinversión automática: sólo inversiones vencidas sin retiro solicitado.
-- La v9 la definió como RETURNS void; ahora devuelve la cantidad de contratos
-- reinvertidos, y CREATE OR REPLACE no puede cambiar el tipo de retorno.
DROP FUNCTION IF EXISTS public.check_and_reinvest_expired_contracts();

CREATE OR REPLACE FUNCTION public.check_and_reinvest_expired_contracts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_new_end_date DATE;
  v_accrued_capital NUMERIC(15,2);
  v_next_venc DATE;
  v_duration INTEGER;
  v_new_id UUID;
  v_count INTEGER := 0;
  v_enabled BOOLEAN;
BEGIN
  SELECT COALESCE((value->>'auto_reinvest')::BOOLEAN, TRUE) INTO v_enabled
  FROM public.system_settings WHERE key = 'automation_config';
  IF v_enabled IS FALSE THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT * FROM public.contracts
    WHERE status = 'activo'
      AND kind = 'inversion'
      AND end_date < CURRENT_DATE
      AND withdrawal_requested_at IS NULL
  LOOP
    v_duration := GREATEST(1, (r.end_date - r.start_date));

    -- El capital se congela en el vencimiento: no sigue devengando sin contrato
    v_accrued_capital := ROUND(
      r.initial_capital * POWER(1 + (r.monthly_rate / 100.0), v_duration::NUMERIC / 30.0), 2
    );

    v_next_venc := r.end_date + v_duration;
    IF EXTRACT(ISODOW FROM v_next_venc) = 6 THEN v_new_end_date := v_next_venc + 2;
    ELSIF EXTRACT(ISODOW FROM v_next_venc) = 7 THEN v_new_end_date := v_next_venc + 1;
    ELSE v_new_end_date := v_next_venc;
    END IF;

    UPDATE public.contracts SET status = 'reinvertido', current_capital = v_accrued_capital
    WHERE id = r.id;

    INSERT INTO public.contracts (
      client_id, asset_id, initial_capital, current_capital, currency,
      monthly_rate, start_date, end_date, status, template_id, kind
    ) VALUES (
      r.client_id, r.asset_id, v_accrued_capital, v_accrued_capital, r.currency,
      r.monthly_rate, r.end_date, v_new_end_date, 'activo', r.template_id, 'inversion'
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.contract_events (contract_id, event_type, metadata)
    VALUES (r.id, 'generated', jsonb_build_object(
      'reason', 'Reinversión automática al vencimiento',
      'accrued_capital', v_accrued_capital,
      'new_contract_id', v_new_id,
      'new_end_date', v_new_end_date
    ));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


-- Marca cuotas vencidas y créditos morosos; devuelve el resumen del día
CREATE OR REPLACE FUNCTION public.rendimax_run_daily_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reinvested INTEGER;
  v_overdue INTEGER;
  v_late INTEGER;
  v_recovered INTEGER;
  v_expired INTEGER;
  v_threshold INTEGER;
BEGIN
  v_threshold := public.rendimax_late_threshold_days();

  -- 1. Reinversión automática de inversiones vencidas
  v_reinvested := public.check_and_reinvest_expired_contracts();

  -- 2. Cuotas impagas que ya vencieron
  UPDATE public.credit_installments
  SET status = 'vencido'
  WHERE status = 'pendiente' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_overdue = ROW_COUNT;

  -- 3. Créditos con atraso mayor al umbral → moroso
  UPDATE public.credits c
  SET status = 'moroso'
  WHERE c.status = 'vigente'
    AND EXISTS (
      SELECT 1 FROM public.credit_installments ci
      WHERE ci.credit_id = c.id
        AND ci.status <> 'pagado'
        AND ci.due_date < CURRENT_DATE - v_threshold
    );
  GET DIAGNOSTICS v_late = ROW_COUNT;

  -- 4. Morosos que se pusieron al día → vigente
  UPDATE public.credits c
  SET status = 'vigente'
  WHERE c.status = 'moroso'
    AND NOT EXISTS (
      SELECT 1 FROM public.credit_installments ci
      WHERE ci.credit_id = c.id
        AND ci.status <> 'pagado'
        AND ci.due_date < CURRENT_DATE
    );
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  -- 5. Inversiones vencidas con retiro solicitado: quedan 'vencido' a la espera
  --    de que el administrador confirme el pago (no se reinvierten solas)
  UPDATE public.contracts
  SET status = 'vencido'
  WHERE kind = 'inversion'
    AND status = 'activo'
    AND end_date < CURRENT_DATE
    AND withdrawal_requested_at IS NOT NULL;
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  RETURN jsonb_build_object(
    'ran_at', NOW(),
    'reinvested_contracts', v_reinvested,
    'installments_marked_overdue', v_overdue,
    'credits_marked_late', v_late,
    'credits_recovered', v_recovered,
    'contracts_marked_expired', v_expired,
    'late_threshold_days', v_threshold
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rendimax_run_daily_jobs() FROM anon, authenticated;


-- ================================================================
-- 9. RESUMEN DE CLIENTES EN UNA SOLA CONSULTA
-- ================================================================
-- El listado hacía 2 consultas por cliente (N+1): con 200 clientes eran 401
-- requests en cada carga de la pantalla.
CREATE OR REPLACE VIEW public.clients_overview AS
SELECT
  p.*,
  COALESCE(ct.contracts_count, 0)::INTEGER AS contracts_count,
  COALESCE(cr.credits_count, 0)::INTEGER AS credits_count,
  COALESCE(ct.active_capital_ars, 0)::NUMERIC AS active_capital_ars,
  COALESCE(ct.active_capital_usd, 0)::NUMERIC AS active_capital_usd
FROM public.profiles p
LEFT JOIN (
  SELECT client_id,
         COUNT(*) FILTER (WHERE kind = 'inversion') AS contracts_count,
         SUM(initial_capital) FILTER (WHERE kind = 'inversion' AND status = 'activo' AND currency = 'ARS') AS active_capital_ars,
         SUM(initial_capital) FILTER (WHERE kind = 'inversion' AND status = 'activo' AND currency = 'USD') AS active_capital_usd
  FROM public.contracts GROUP BY client_id
) ct ON ct.client_id = p.id
LEFT JOIN (
  SELECT client_id, COUNT(*) AS credits_count
  FROM public.credits GROUP BY client_id
) cr ON cr.client_id = p.id;

-- La vista hereda el RLS de `profiles` (security_invoker)
ALTER VIEW public.clients_overview SET (security_invoker = true);
GRANT SELECT ON public.clients_overview TO authenticated;
REVOKE ALL ON public.clients_overview FROM anon;


-- ================================================================
-- 10. DISPONIBILIDAD DE CUIT EN EL REGISTRO PÚBLICO
-- ================================================================
-- `profiles.cuit` es UNIQUE: si el CUIT ya existía, auth.signUp creaba el
-- usuario pero el trigger fallaba y quedaba una cuenta sin perfil, imposible
-- de usar y sin forma de salir del portal.
CREATE OR REPLACE FUNCTION public.is_cuit_available(p_cuit TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE regexp_replace(cuit, '\D', '', 'g') = regexp_replace(p_cuit, '\D', '', 'g')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_cuit_available(TEXT) TO anon, authenticated;

-- Red de seguridad: si el alta del perfil falla, no dejar el usuario huérfano
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuit TEXT;
BEGIN
  v_cuit := COALESCE(
    NEW.raw_user_meta_data->>'cuit',
    NEW.raw_user_meta_data->>'dni',
    'PENDING-' || LEFT(NEW.id::text, 8)
  );

  -- Un CUIT ya tomado no puede bloquear el alta: se guarda como pendiente de
  -- revisión en lugar de abortar y dejar el usuario sin perfil.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE cuit = v_cuit) THEN
    v_cuit := 'DUP-' || LEFT(NEW.id::text, 8);
  END IF;

  INSERT INTO public.profiles (id, full_name, cuit, phone, address, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    v_cuit,
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'address',
    NEW.email,
    'investor'
  );
  RETURN NEW;
END;
$$;


-- ================================================================
-- 11. LIMPIEZA
-- ================================================================
-- `bcra_yield_config` se escribía y leía sólo en la pantalla de configuración:
-- ninguna otra parte del sistema lo consumía.
DELETE FROM public.system_settings WHERE key = 'bcra_yield_config';

-- `contract_url` quedó del schema original y nunca se escribió. El PDF firmado
-- vive en contract_pdf_url / contract_pdf_path. Se migra lo que hubiera.
UPDATE public.contracts
SET contract_pdf_path = COALESCE(contract_pdf_path, id::text || '_signed.pdf')
WHERE contract_pdf_url IS NOT NULL AND contract_pdf_path IS NULL;


-- ================================================================
-- 12. PROGRAMACIÓN (elegir UNA de las dos opciones)
-- ================================================================
-- OPCIÓN A — pg_cron dentro de Supabase (recomendada).
--   Habilitá la extensión en Database → Extensions y ejecutá:
--
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   SELECT cron.schedule(
--     'rendimax-daily-jobs',
--     '5 6 * * *',                       -- 06:05 UTC ≈ 03:05 ART
--     $$SELECT public.rendimax_run_daily_jobs();$$
--   );
--
--   Para ver las corridas:  SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--   Para desprogramar:      SELECT cron.unschedule('rendimax-daily-jobs');
--
-- OPCIÓN B — Vercel Cron, que ya quedó configurado en `vercel.json` y pega
--   contra /api/cron/daily-jobs con el header Authorization: Bearer $CRON_SECRET.
--   No requiere nada más acá.
-- ================================================================


-- ================================================================
-- VERIFICACIÓN
-- ================================================================
-- SELECT kind, status, COUNT(*) FROM public.contracts GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT public.rendimax_run_daily_jobs();
-- SELECT * FROM public.ledger_entries ORDER BY created_at DESC LIMIT 20;
