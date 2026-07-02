-- Migración V9: Renombrar DNI a CUIT, campos de scoring y automatizaciones

-- 1. Renombrar columna dni a cuit en profiles
ALTER TABLE public.profiles RENAME COLUMN dni TO cuit;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'profiles_dni_key' 
          AND table_name = 'profiles'
    ) THEN
        ALTER TABLE public.profiles RENAME CONSTRAINT profiles_dni_key TO profiles_cuit_key;
    END IF;
END $$;

-- 2. Agregar campos para el Scoring Crediticio de IA
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_scoring_report TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_scoring_recommendation TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_scoring_limit NUMERIC(15, 2);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cost_of_living NUMERIC(15, 2);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bcra_raw_report TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credit_scoring_updated_at TIMESTAMP WITH TIME ZONE;

-- 3. Actualizar la función de creación automática de perfil al registrar un usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, cuit, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'cuit', COALESCE(NEW.raw_user_meta_data->>'dni', 'PENDING-' || LEFT(NEW.id::text, 8))),
    COALESCE(NEW.raw_user_meta_data->>'role', 'investor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger para insertar automáticamente los activos de contratos firmados 'en_consignacion' o 'activo' a 'assets_available'
CREATE OR REPLACE FUNCTION public.handle_contract_asset_available()
RETURNS TRIGGER AS $$
DECLARE
  v_asset_type TEXT;
  v_description TEXT;
  v_market_value NUMERIC;
  v_currency TEXT;
  v_client_name TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Comprobar si el contrato tiene un activo y se marca como en_consignacion o activo
  IF NEW.asset_id IS NOT NULL AND (NEW.status = 'en_consignacion' OR NEW.status = 'activo') THEN
    -- Verificar si ya existe en assets_available
    SELECT EXISTS (
      SELECT 1 FROM public.assets_available WHERE asset_valuation_id = NEW.asset_id
    ) INTO v_exists;
    
    IF NOT v_exists THEN
      -- Obtener datos de la tasación
      SELECT asset_type, description, market_value, currency 
      INTO v_asset_type, v_description, v_market_value, v_currency
      FROM public.assets_valuation
      WHERE id = NEW.asset_id;
      
      -- Obtener nombre del cliente
      SELECT full_name INTO v_client_name
      FROM public.profiles
      WHERE id = NEW.client_id;
      
      -- Insertar en Activos Disponibles
      INSERT INTO public.assets_available (
        asset_valuation_id,
        title,
        description,
        asset_type,
        listed_value,
        currency,
        status
      ) VALUES (
        NEW.asset_id,
        COALESCE(UPPER(LEFT(v_asset_type, 1)) || SUBSTRING(v_asset_type FROM 2), 'Activo') || ' - ' || COALESCE(v_description, ''),
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger
DROP TRIGGER IF EXISTS on_contract_updated_or_created ON public.contracts;
CREATE TRIGGER on_contract_updated_or_created
  AFTER INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.handle_contract_asset_available();

-- 5. Función RPC para reinvertir automáticamente contratos activos vencidos sin solicitud de retiro
CREATE OR REPLACE FUNCTION public.check_and_reinvest_expired_contracts()
RETURNS void AS $$
DECLARE
  r RECORD;
  v_new_end_date DATE;
  v_accrued_capital NUMERIC(15,2);
  v_next_venc DATE;
BEGIN
  FOR r IN 
    SELECT * FROM public.contracts 
    WHERE status = 'activo' AND end_date < CURRENT_DATE
  LOOP
    -- Calcular capital acumulado a la fecha de vencimiento usando interés compuesto
    -- fórmula: capital_inicial * (1 + tasa_mensual / 100) ^ (días_totales / 30)
    v_accrued_capital := ROUND(
      r.initial_capital * POWER(
        1 + (r.monthly_rate / 100.0), 
        (r.end_date - r.start_date)::numeric / 30.0
      ), 
      2
    );

    -- Calcular la siguiente fecha de vencimiento manteniendo la misma duración del contrato
    v_next_venc := r.end_date + (r.end_date - r.start_date);
    
    -- Ajustar la fecha de vencimiento para que no finalice en fin de semana
    IF EXTRACT(ISODOW FROM v_next_venc) = 6 THEN -- Sábado
      v_new_end_date := v_next_venc + 2;
    ELSIF EXTRACT(ISODOW FROM v_next_venc) = 7 THEN -- Domingo
      v_new_end_date := v_next_venc + 1;
    ELSE
      v_new_end_date := v_next_venc;
    END IF;

    -- Actualizar el contrato antiguo
    UPDATE public.contracts 
    SET status = 'reinvertido' 
    WHERE id = r.id;

    -- Insertar el nuevo contrato reinvertido
    INSERT INTO public.contracts (
      client_id,
      asset_id,
      initial_capital,
      current_capital,
      currency,
      monthly_rate,
      start_date,
      end_date,
      status,
      template_id
    ) VALUES (
      r.client_id,
      r.asset_id,
      v_accrued_capital,
      v_accrued_capital,
      r.currency,
      r.monthly_rate,
      r.end_date,
      v_new_end_date,
      'activo',
      r.template_id
    );
    
    -- Registrar evento del contrato
    INSERT INTO public.contract_events (
      contract_id,
      event_type,
      metadata
    ) VALUES (
      r.id,
      'generated',
      jsonb_build_object(
        'reason', 'Auto-reinvestment expired contract',
        'accrued_capital', v_accrued_capital,
        'new_end_date', v_new_end_date
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
