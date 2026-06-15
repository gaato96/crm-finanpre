-- Migración V7: Función para eliminar completamente a un usuario (auth.users)

CREATE OR REPLACE FUNCTION public.delete_user_admin(user_id UUID)
RETURNS void AS $$
BEGIN
  -- Verificar si el que llama es admin
  IF public.get_my_role() != 'admin' THEN
    RAISE EXCEPTION 'Solo los administradores pueden eliminar usuarios';
  END IF;

  -- Borrar el usuario de auth.users. 
  -- Al borrar esto, el CASCADE de la base de datos se encargará de borrar 
  -- automáticamente su registro en public.profiles y cualquier otro dato vinculado.
  DELETE FROM auth.users WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
