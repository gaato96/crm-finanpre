-- Migración V8: Agregar columna metadata a assets_valuation

-- Permite almacenar toda la información detallada del activo (años de construcción, planos, estado de impuestos, apto crédito)
-- y los resultados del cálculo de Facilidad de Venta (Score, Etiqueta y Razones).
ALTER TABLE public.assets_valuation
  ADD COLUMN IF NOT EXISTS metadata JSONB;
