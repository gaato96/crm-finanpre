-- ================================================================
-- FINANPRE — SQL SCHEMA INITIALIZATION
-- Run this in the Supabase SQL Editor to set up the full database
-- ================================================================

-- 1. Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    dni TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT CHECK (role IN ('admin', 'investor')) NOT NULL DEFAULT 'investor',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Asset Valuation table
CREATE TABLE IF NOT EXISTS public.assets_valuation (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    asset_type TEXT CHECK (asset_type IN ('pesos', 'dolares', 'vehiculo', 'inmueble')) NOT NULL,
    description TEXT NOT NULL,
    market_value NUMERIC(15, 2) NOT NULL,
    status TEXT CHECK (status IN ('pendiente', 'tasado', 'vendido', 'financiado')) NOT NULL DEFAULT 'tasado',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    asset_id UUID REFERENCES public.assets_valuation(id) ON DELETE SET NULL,
    initial_capital NUMERIC(15, 2) NOT NULL,
    currency TEXT CHECK (currency IN ('ARS', 'USD')) NOT NULL,
    monthly_rate NUMERIC(5, 2) NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    status TEXT CHECK (status IN ('activo', 'vencido', 'retirado', 'reinvertido')) NOT NULL DEFAULT 'activo',
    contract_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Credits table
CREATE TABLE IF NOT EXISTS public.credits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    total_amount NUMERIC(15, 2) NOT NULL,
    interest_rate NUMERIC(5, 2) NOT NULL,
    total_installments INTEGER NOT NULL,
    status TEXT CHECK (status IN ('vigente', 'finalizado', 'moroso')) NOT NULL DEFAULT 'vigente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Credit Installments table
CREATE TABLE IF NOT EXISTS public.credit_installments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    credit_id UUID REFERENCES public.credits(id) ON DELETE CASCADE NOT NULL,
    installment_number INTEGER NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    due_date DATE NOT NULL,
    status TEXT CHECK (status IN ('pendiente', 'pagado', 'vencido')) NOT NULL DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ================================================================
-- ENABLE ROW LEVEL SECURITY
-- ================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets_valuation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_installments ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- RLS POLICIES — ADMIN: Full access
-- ================================================================

-- Profiles
CREATE POLICY "Admin full access to profiles"
ON public.profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Assets Valuation
CREATE POLICY "Admin full access to assets_valuation"
ON public.assets_valuation FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Contracts
CREATE POLICY "Admin full access to contracts"
ON public.contracts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Credits
CREATE POLICY "Admin full access to credits"
ON public.credits FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Credit Installments
CREATE POLICY "Admin full access to credit_installments"
ON public.credit_installments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ================================================================
-- RLS POLICIES — INVESTOR: Read own data only
-- ================================================================

-- Profiles (investor reads own profile)
CREATE POLICY "Investor reads own profile"
ON public.profiles FOR SELECT
USING (id = auth.uid());

-- Assets Valuation (investor reads own assets)
CREATE POLICY "Investor reads own assets"
ON public.assets_valuation FOR SELECT
USING (client_id = auth.uid());

-- Contracts (investor reads own contracts)
CREATE POLICY "Investor reads own contracts"
ON public.contracts FOR SELECT
USING (client_id = auth.uid());

-- Contracts (investor can update own contracts — for reinvest/withdraw actions)
CREATE POLICY "Investor updates own contracts"
ON public.contracts FOR UPDATE
USING (client_id = auth.uid());

-- Contracts (investor can insert — for reinvestment new contracts)
CREATE POLICY "Investor inserts own contracts"
ON public.contracts FOR INSERT
WITH CHECK (client_id = auth.uid());

-- Credits (investor reads own credits)
CREATE POLICY "Investor reads own credits"
ON public.credits FOR SELECT
USING (client_id = auth.uid());

-- Credit Installments (investor reads own installments via credit)
CREATE POLICY "Investor reads own installments"
ON public.credit_installments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.credits
    WHERE credits.id = credit_installments.credit_id
    AND credits.client_id = auth.uid()
  )
);

-- ================================================================
-- AUTO-CREATE PROFILE ON AUTH SIGNUP (Trigger)
-- ================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, dni, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'dni', 'PENDING-' || LEFT(NEW.id::text, 8)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'investor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
