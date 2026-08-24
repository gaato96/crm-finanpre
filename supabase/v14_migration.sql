-- ================================================================
-- RENDIMAX CRM v14 — MIGRACIÓN DE SEGURIDAD Y PLANTILLAS
-- Ejecutar DESPUÉS de v13_migration.sql
-- ================================================================

-- ================================================================
-- 0. REGISTRO PÚBLICO: EL USUARIO NO PUEDE ELEGIR SU PROPIO ROL
-- ================================================================
-- handle_new_user tomaba el rol de raw_user_meta_data, que lo escribe quien
-- llama a auth.signUp. Cualquiera podía registrarse desde la web enviando
-- role='admin' y quedaba con acceso total al panel y a los datos.
-- El alta pública ahora es SIEMPRE 'investor'; los roles admin/vendedor se
-- asignan después desde el panel (server actions que verifican al llamante).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, cuit, phone, address, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'cuit', COALESCE(NEW.raw_user_meta_data->>'dni', 'PENDING-' || LEFT(NEW.id::text, 8))),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'address',
    NEW.email,
    'investor'
  );
  RETURN NEW;
END;
$$;

-- Detectar cuentas que se hayan auto-asignado un rol elevado antes de este parche:
--   SELECT p.id, p.full_name, p.role, u.email, u.created_at
--   FROM public.profiles p JOIN auth.users u ON u.id = p.id
--   WHERE p.role IN ('admin','vendedor')
--   ORDER BY u.created_at DESC;

-- ================================================================
-- 1. IMPEDIR LA ESCALADA DE PRIVILEGIOS
-- ================================================================
-- La política "Vendedor access to profiles" es FOR ALL: un vendedor podía
-- ejecutar `update profiles set role='admin' where id = <su propio id>` y
-- quedarse con el panel completo. RLS no puede comparar el valor viejo con el
-- nuevo, así que se controla con un trigger.

CREATE OR REPLACE FUNCTION public.enforce_role_change_is_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- auth.uid() es NULL cuando corre con clave de servicio (server actions ya validadas)
    IF auth.uid() IS NOT NULL AND public.get_my_role() <> 'admin' THEN
      RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un usuario';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_role_change ON public.profiles;
CREATE TRIGGER on_profile_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_role_change_is_admin_only();

-- Un vendedor tampoco debería poder eliminar perfiles ni tocar administradores.
DROP POLICY IF EXISTS "Vendedor access to profiles" ON public.profiles;

CREATE POLICY "Vendedor lee perfiles"
ON public.profiles FOR SELECT
USING (public.get_my_role() = 'vendedor');

CREATE POLICY "Vendedor crea clientes"
ON public.profiles FOR INSERT
WITH CHECK (public.get_my_role() = 'vendedor' AND role = 'investor');

CREATE POLICY "Vendedor edita clientes"
ON public.profiles FOR UPDATE
USING (public.get_my_role() = 'vendedor' AND role = 'investor')
WITH CHECK (public.get_my_role() = 'vendedor' AND role = 'investor');

-- ================================================================
-- 2. EL INVERSOR PUEDE EDITAR SUS PROPIOS DATOS DE CONTACTO
-- ================================================================
-- El trigger de arriba impide que se cambie el rol a sí mismo.
DROP POLICY IF EXISTS "Investor updates own profile" ON public.profiles;
CREATE POLICY "Investor updates own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- ================================================================
-- 3. PLANTILLAS DE CONTRATO LEGIBLES POR EL FIRMANTE
-- ================================================================
-- El portal muestra la previsualización del contrato antes de firmar, pero
-- contract_templates solo tenía política de admin: el inversor veía la
-- previsualización vacía.
DROP POLICY IF EXISTS "Usuarios autenticados leen plantillas activas" ON public.contract_templates;
CREATE POLICY "Usuarios autenticados leen plantillas activas"
ON public.contract_templates FOR SELECT
TO authenticated
USING (is_active = TRUE);

-- ================================================================
-- 4. BUCKET DE CONTRATOS: CERRAR LA SUBIDA ANÓNIMA LIBRE
-- ================================================================
-- La política anterior permitía a cualquier visitante subir cualquier archivo
-- al bucket público. Ahora solo se acepta el PDF de un contrato que esté
-- efectivamente pendiente de firma, y con el nombre exacto que le corresponde.
DROP POLICY IF EXISTS "Public insert access to contracts bucket" ON storage.objects;

CREATE POLICY "Subida del PDF de un contrato pendiente de firma"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'contracts'
  AND EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE storage.objects.name = c.id::text || '_signed.pdf'
      AND c.status IN ('borrador', 'enviado')
  )
);

-- Actualizar un PDF ya subido queda reservado al personal autenticado
DROP POLICY IF EXISTS "Personal actualiza PDFs de contratos" ON storage.objects;
CREATE POLICY "Personal actualiza PDFs de contratos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'contracts' AND public.get_my_role() IN ('admin', 'vendedor'));

DROP POLICY IF EXISTS "Personal elimina PDFs de contratos" ON storage.objects;
CREATE POLICY "Personal elimina PDFs de contratos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'contracts' AND public.get_my_role() = 'admin');

-- ================================================================
-- 5. BORRADO DE PLANTILLAS Y CONTRATOS (limpieza de pruebas)
-- ================================================================
-- contract_templates ya tiene política de admin FOR ALL; se agrega el índice
-- que faltaba para el listado y se documenta el efecto del borrado:
--   contracts.template_id  -> ON DELETE SET NULL (v6)
--   contract_events        -> ON DELETE CASCADE (v2)
--   credits.contract_id    -> ON DELETE SET NULL (v6)
CREATE INDEX IF NOT EXISTS idx_contract_templates_type_active
  ON public.contract_templates(type, is_active);

-- ================================================================
-- 6. HIGIENE: revocar el acceso anónimo a las tablas sensibles
-- ================================================================
-- Refuerzo defensivo: aunque RLS ya bloquea, se quita el permiso base a `anon`.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.contracts FROM anon;
REVOKE ALL ON public.credits FROM anon;
REVOKE ALL ON public.credit_installments FROM anon;
REVOKE ALL ON public.assets_valuation FROM anon;
REVOKE ALL ON public.assets_available FROM anon;
REVOKE ALL ON public.contract_events FROM anon;
REVOKE ALL ON public.contract_templates FROM anon;
REVOKE ALL ON public.system_settings FROM anon;
REVOKE ALL ON public.announcements FROM anon;
REVOKE ALL ON public.guarantors FROM anon;
