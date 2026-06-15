-- Migración V6: Fix de restricciones de claves foráneas (Foreign Keys) para eliminación en cascada

-- 1. Arreglar assets_available -> assets_valuation (Si se borra la tasación/cliente, borrar el activo disponible)
ALTER TABLE public.assets_available
  DROP CONSTRAINT IF EXISTS assets_available_asset_valuation_id_fkey,
  ADD CONSTRAINT assets_available_asset_valuation_id_fkey
    FOREIGN KEY (asset_valuation_id)
    REFERENCES public.assets_valuation(id)
    ON DELETE CASCADE;

-- 2. Arreglar credits -> contracts (Si se borra el contrato, no borrar el crédito, simplemente dejar el campo en NULL)
ALTER TABLE public.credits
  DROP CONSTRAINT IF EXISTS credits_contract_id_fkey,
  ADD CONSTRAINT credits_contract_id_fkey
    FOREIGN KEY (contract_id)
    REFERENCES public.contracts(id)
    ON DELETE SET NULL;

-- 3. Arreglar contracts -> contract_templates (Si se borra la plantilla, dejar el template_id en NULL en los contratos)
ALTER TABLE public.contracts
  DROP CONSTRAINT IF EXISTS contracts_template_id_fkey,
  ADD CONSTRAINT contracts_template_id_fkey
    FOREIGN KEY (template_id)
    REFERENCES public.contract_templates(id)
    ON DELETE SET NULL;
