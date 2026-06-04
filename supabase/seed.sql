-- ================================================================
-- FINANPRE — SEED DATA
-- Run this AFTER schema.sql and AFTER creating auth users in Supabase
-- ================================================================
-- 
-- INSTRUCTIONS:
-- 1. First, create the following users in Supabase Auth (Dashboard > Authentication > Users):
--    
--    ADMINS:
--    - admin1@finanpre.com / password: Admin123! (copy the UUID)
--    - admin2@finanpre.com / password: Admin123! (copy the UUID)
--    
--    INVESTORS:
--    - inversor1@finanpre.com / password: Investor123!
--    - inversor2@finanpre.com / password: Investor123!
--    - inversor3@finanpre.com / password: Investor123!
--    
--    DEBTORS (also investors role):
--    - deudor1@finanpre.com / password: Deudor123!
--    - deudor2@finanpre.com / password: Deudor123!
--
-- 2. Replace the UUIDs below with the actual UUIDs from Supabase Auth.
-- 3. Run this SQL in the Supabase SQL Editor.
-- ================================================================

-- Replace these with actual UUIDs from auth.users
DO $$
DECLARE
  admin1_id UUID := '65a8be00-fefe-416b-a808-e8c07c7b4833'; -- Replace
  admin2_id UUID := 'da6c189c-d518-4861-a9b1-360710cf3059'; -- Replace
  inv1_id UUID := 'a9062bda-858c-49e2-b86e-a22332b74bfb';   -- Replace
  inv2_id UUID := '00000000-0000-0000-0000-000000000004';   -- Replace
  inv3_id UUID := '00000000-0000-0000-0000-000000000005';   -- Replace
  deu1_id UUID := '00000000-0000-0000-0000-000000000006';   -- Replace
  deu2_id UUID := '00000000-0000-0000-0000-000000000007';   -- Replace
  -- Asset/contract/credit IDs
  asset_inv1 UUID;
  asset_inv2 UUID;
  asset_inv3 UUID;
  contract_inv1 UUID;
  contract_inv2 UUID;
  contract_inv3 UUID;
  credit_deu1 UUID;
  credit_deu2 UUID;
BEGIN

  -- ================================================================
  -- PROFILES
  -- ================================================================
  
  -- Admin 1
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (admin1_id, 'Carlos Administrador', '20345678', '+54 11 5555-0001', 'admin')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = 'admin';

  -- Admin 2
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (admin2_id, 'María Gestora', '20345679', '+54 11 5555-0002', 'admin')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = 'admin';

  -- Inversor 1: Efectivo USD
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (inv1_id, 'Juan Pérez', '30456789', '+54 11 4444-1001', 'investor')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Inversor 2: Vehículo tasado ARS
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (inv2_id, 'Laura Gómez', '30456790', '+54 11 4444-1002', 'investor')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Inversor 3: Contrato vencido
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (inv3_id, 'Roberto Sánchez', '30456791', '+54 11 4444-1003', 'investor')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Deudor 1: Crédito vigente al día
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (deu1_id, 'Ana Martínez', '30456792', '+54 11 4444-2001', 'investor')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- Deudor 2: Crédito moroso
  INSERT INTO public.profiles (id, full_name, dni, phone, role)
  VALUES (deu2_id, 'Pedro López', '30456793', '+54 11 4444-2002', 'investor')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  -- ================================================================
  -- ASSETS VALUATION
  -- ================================================================

  -- Inversor 1: Efectivo USD $5,000
  INSERT INTO public.assets_valuation (client_id, asset_type, description, market_value, status)
  VALUES (inv1_id, 'dolares', 'Efectivo USD', 5000.00, 'tasado')
  RETURNING id INTO asset_inv1;

  -- Inversor 2: Toyota Corolla 2021 tasado en ARS $12,000,000
  INSERT INTO public.assets_valuation (client_id, asset_type, description, market_value, status)
  VALUES (inv2_id, 'vehiculo', 'Toyota Corolla 2021 - Blanco, 45.000km, excelente estado', 12000000.00, 'financiado')
  RETURNING id INTO asset_inv2;

  -- Inversor 3: Efectivo ARS (contrato vencido)
  INSERT INTO public.assets_valuation (client_id, asset_type, description, market_value, status)
  VALUES (inv3_id, 'pesos', 'Efectivo ARS', 2500000.00, 'tasado')
  RETURNING id INTO asset_inv3;

  -- ================================================================
  -- CONTRACTS
  -- ================================================================

  -- Inversor 1: Contrato ACTIVO en USD, 5.5% mensual, iniciado hace 15 días
  INSERT INTO public.contracts (client_id, asset_id, initial_capital, currency, monthly_rate, start_date, end_date, status)
  VALUES (
    inv1_id, asset_inv1, 5000.00, 'USD', 5.50,
    CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE + INTERVAL '15 days',
    'activo'
  ) RETURNING id INTO contract_inv1;

  -- Inversor 2: Contrato ACTIVO en ARS respaldado por vehículo, 7% mensual, iniciado hace 10 días
  INSERT INTO public.contracts (client_id, asset_id, initial_capital, currency, monthly_rate, start_date, end_date, status)
  VALUES (
    inv2_id, asset_inv2, 12000000.00, 'ARS', 7.00,
    CURRENT_DATE - INTERVAL '10 days',
    CURRENT_DATE + INTERVAL '20 days',
    'activo'
  ) RETURNING id INTO contract_inv2;

  -- Inversor 3: Contrato VENCIDO, esperando resolución
  INSERT INTO public.contracts (client_id, asset_id, initial_capital, currency, monthly_rate, start_date, end_date, status)
  VALUES (
    inv3_id, asset_inv3, 2500000.00, 'ARS', 6.00,
    CURRENT_DATE - INTERVAL '32 days',
    CURRENT_DATE - INTERVAL '2 days',
    'vencido'
  ) RETURNING id INTO contract_inv3;

  -- ================================================================
  -- CREDITS
  -- ================================================================

  -- Deudor 1: Crédito vigente, cuotas al día - $500,000 ARS, 15% interés, 6 cuotas
  INSERT INTO public.credits (client_id, total_amount, interest_rate, total_installments, status)
  VALUES (deu1_id, 500000.00, 15.00, 6, 'vigente')
  RETURNING id INTO credit_deu1;

  -- Deudor 2: Crédito moroso - $800,000 ARS, 12% interés, 4 cuotas
  INSERT INTO public.credits (client_id, total_amount, interest_rate, total_installments, status)
  VALUES (deu2_id, 800000.00, 12.00, 4, 'moroso')
  RETURNING id INTO credit_deu2;

  -- ================================================================
  -- CREDIT INSTALLMENTS
  -- ================================================================

  -- Deudor 1: 6 cuotas, las primeras 3 pagadas, las siguientes 3 pendientes (al día)
  INSERT INTO public.credit_installments (credit_id, installment_number, amount, due_date, status) VALUES
    (credit_deu1, 1, 95833.33, CURRENT_DATE - INTERVAL '90 days', 'pagado'),
    (credit_deu1, 2, 95833.33, CURRENT_DATE - INTERVAL '60 days', 'pagado'),
    (credit_deu1, 3, 95833.33, CURRENT_DATE - INTERVAL '30 days', 'pagado'),
    (credit_deu1, 4, 95833.33, CURRENT_DATE + INTERVAL '1 day', 'pendiente'),
    (credit_deu1, 5, 95833.33, CURRENT_DATE + INTERVAL '30 days', 'pendiente'),
    (credit_deu1, 6, 95833.35, CURRENT_DATE + INTERVAL '60 days', 'pendiente');

  -- Deudor 2: 4 cuotas, cuota 1 pagada, cuota 2 VENCIDA (morosa), cuotas 3-4 pendientes
  INSERT INTO public.credit_installments (credit_id, installment_number, amount, due_date, status) VALUES
    (credit_deu2, 1, 224000.00, CURRENT_DATE - INTERVAL '60 days', 'pagado'),
    (credit_deu2, 2, 224000.00, CURRENT_DATE - INTERVAL '15 days', 'pendiente'),  -- OVERDUE! triggers moroso alert
    (credit_deu2, 3, 224000.00, CURRENT_DATE + INTERVAL '15 days', 'pendiente'),
    (credit_deu2, 4, 224000.00, CURRENT_DATE + INTERVAL '45 days', 'pendiente');

  RAISE NOTICE 'Seed data inserted successfully!';
END $$;
