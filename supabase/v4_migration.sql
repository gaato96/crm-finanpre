-- ================================================================
-- FINANPRE CRM v4 — MIGRATION FOR CONSIGNMENT & WITHDRAWAL DETAILS
-- ================================================================

-- 1. Agregar columnas de consignación y detalles de retiro a public.contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS consignacion_dias INTEGER,
  ADD COLUMN IF NOT EXISTS consignacion_inicio DATE,
  ADD COLUMN IF NOT EXISTS consignacion_fin DATE,
  ADD COLUMN IF NOT EXISTS withdrawal_requested_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT CHECK (withdrawal_type IN ('total', 'parcial_porcentaje', 'parcial_monto')),
  ADD COLUMN IF NOT EXISTS withdrawal_requested_percentage NUMERIC(5,2);

-- 2. Actualizar los estados permitidos en contracts para incluir 'en_consignacion'
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('borrador', 'enviado', 'pendiente_fondos', 'en_consignacion', 'activo', 'retiro_solicitado', 'retirado', 'reinvertido', 'vencido'));
