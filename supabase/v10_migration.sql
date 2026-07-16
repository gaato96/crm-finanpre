-- ================================================================
-- FINANPRE CRM v10 — MIGRATION
-- Ajustes de Rendimiento Mensual y WhatsApp del Administrador
-- ================================================================

-- 1. Insertar configuración por defecto para rendimiento mensual (ARS y USD)
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'monthly_yield_config',
  '{
    "ars_monthly_rate": 8.5,
    "usd_monthly_rate": 5.0
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 2. Insertar número de WhatsApp por defecto para el administrador
INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'admin_whatsapp',
  '{
    "phone": "5493815000000"
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;
