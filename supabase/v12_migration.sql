-- ================================================================
-- RENDIMAX CRM v12 — MIGRATION
-- Tipos de crédito (cuotas fijas / decrecientes / refinanciación constante),
-- fecha de pago elegible y desglose capital/interés por cuota.
-- Ejecutar DESPUÉS de v11_migration.sql
-- ================================================================

-- 1. Tipo de crédito y fecha de pago elegida por el administrador
ALTER TABLE public.credits
  ADD COLUMN IF NOT EXISTS credit_type TEXT NOT NULL DEFAULT 'fija',
  ADD COLUMN IF NOT EXISTS first_due_date DATE,
  ADD COLUMN IF NOT EXISTS payment_day INTEGER,
  ADD COLUMN IF NOT EXISTS payoff_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS payoff_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.credits DROP CONSTRAINT IF EXISTS credits_credit_type_check;
ALTER TABLE public.credits ADD CONSTRAINT credits_credit_type_check
  CHECK (credit_type IN ('fija', 'decreciente', 'refinanciacion'));

ALTER TABLE public.credits DROP CONSTRAINT IF EXISTS credits_payment_day_check;
ALTER TABLE public.credits ADD CONSTRAINT credits_payment_day_check
  CHECK (payment_day IS NULL OR (payment_day BETWEEN 1 AND 31));

-- Los créditos existentes quedan como 'fija' (comportamiento histórico intacto)
UPDATE public.credits SET credit_type = 'fija' WHERE credit_type IS NULL;

-- 2. Desglose de capital / interés en cada cuota
ALTER TABLE public.credit_installments
  ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_interest_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_payoff BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2);

-- 3. Backfill del desglose para cuotas ya existentes (todas de tipo 'fija')
UPDATE public.credit_installments ci
SET
  principal_amount = ROUND(c.total_amount / NULLIF(c.total_installments, 0), 2),
  interest_amount = ROUND(ci.amount - (c.total_amount / NULLIF(c.total_installments, 0)), 2)
FROM public.credits c
WHERE ci.credit_id = c.id
  AND (ci.principal_amount IS NULL OR ci.principal_amount = 0)
  AND c.total_installments > 0;

-- 4. Backfill de first_due_date con la primera cuota realmente generada
UPDATE public.credits c
SET first_due_date = sub.min_due,
    payment_day = EXTRACT(DAY FROM sub.min_due)::INTEGER
FROM (
  SELECT credit_id, MIN(due_date) AS min_due
  FROM public.credit_installments
  GROUP BY credit_id
) sub
WHERE c.id = sub.credit_id AND c.first_due_date IS NULL;

-- 5. Índices para el calendario de cuotas y los listados por cliente
CREATE INDEX IF NOT EXISTS idx_credit_installments_due_date
  ON public.credit_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_credit_installments_credit_id
  ON public.credit_installments(credit_id);
CREATE INDEX IF NOT EXISTS idx_credits_client_id
  ON public.credits(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id
  ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON public.contracts(status);
