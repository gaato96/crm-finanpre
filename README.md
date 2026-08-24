# RENDIMAX CRM

Ecosistema digital de inversiones: panel administrativo (CRM), portal del inversor (PWA) y firma electrónica de contratos.

Stack: Next.js 16 (App Router) · React 19 · Tailwind v4 · Supabase (Auth + Postgres + Storage + RLS) · Vercel.

## Puesta en marcha local

```bash
npm install
```

Copiá `.env.local.example` a `.env.local` y completá las variables. Luego:

```bash
npm run dev
```

## Base de datos

Los scripts de `supabase/` se ejecutan **en orden** desde el SQL Editor de Supabase:

| Orden | Archivo | Contenido |
|---|---|---|
| 1 | `schema.sql` | Tablas base y trigger de alta de perfil |
| 2 | `fix_rls.sql` | Función `get_my_role()` y políticas de administrador |
| 3 | `v2_migration.sql` | Contratos v2, eventos, garantes, activos, plantillas, bucket de contratos |
| 4 | `v3_migration.sql` | Anuncios, `system_settings`, rol vendedor |
| 5 | `v4_migration.sql` | Consignación de activos y retiros parciales |
| 6 | `v5_migration.sql` | Registro de envíos de email |
| 7 | `v6_migration.sql` – `v8_migration.sql` | Cascadas de borrado, baja de usuarios, metadata de eventos |
| 8 | `v9_migration.sql` | CUIT, scoring crediticio, reinversión automática |
| 9 | `v10_migration.sql` | Rendimiento mensual y WhatsApp del administrador |
| 10 | `v11_migration.sql` | Teléfono y domicilio en el alta por registro |
| 11 | `v12_migration.sql` | **Tipos de crédito, fecha de pago elegible, desglose capital/interés, índices** |
| 12 | `v13_migration.sql` | Cierre de fugas públicas: RPC de firma, ajustes públicos y bloqueo de escritura del inversor |
| 13 | `v14_migration.sql` | **Rol fijo en el registro público, freno a la escalada de privilegios, plantillas visibles al firmante y cierre de la subida anónima al bucket** |

> Cada migración debe ejecutarse **antes** de desplegar el código que la usa. `v14` es
> especialmente importante: sin ella, cualquiera puede registrarse con rol de administrador.

## Modalidades de crédito

| Modalidad | Semántica de la tasa | Cómo se calcula |
|---|---|---|
| Cuotas fijas | Interés **total** sobre el capital | `capital × (1 + tasa) / n`, cuotas iguales |
| Cuotas decrecientes | Tasa **mensual sobre el saldo** (sistema alemán) | `capital/n + saldo × tasa`; la cuota baja `capital/n × tasa` cada mes |
| Refinanciación constante | Tasa **mensual sobre el capital** | Cuotas de solo interés (`capital × tasa`) hasta cancelar `capital + interés` |

La fecha de pago la elige el administrador al otorgar el crédito: las cuotas siguientes vencen
el mismo día de cada mes (si el mes no tiene ese día, se usa el último).

La lógica vive en [`src/lib/credit.ts`](src/lib/credit.ts) y es pura, sin dependencias de UI ni de base de datos.

## Roles y accesos

| Rol | Acceso |
|---|---|
| `admin` | Todo `/admin` |
| `vendedor` | `/admin`, `/admin/clientes`, `/admin/contratos`, `/admin/creditos` |
| `investor` | `/portal` |

El rol se resuelve siempre contra la tabla `profiles` (nunca desde `user_metadata`, que el
propio usuario puede modificar). La autorización real la aplica RLS en Supabase; `src/proxy.ts`
solo enruta.

## Notas de seguridad

- **Las server actions son endpoints HTTP públicos.** Toda acción administrativa valida al
  llamante con `requireAdmin()` / `requireStaff()` (`src/lib/auth-guard.ts`) antes de usar la
  clave de servicio. Nunca alcanza con que la pantalla que la invoca esté protegida.
- El alta pública siempre crea perfiles `investor`: el rol nunca se toma de
  `raw_user_meta_data`, que lo escribe quien llama a `auth.signUp`.
- Un trigger impide cambiar `profiles.role` a quien no sea administrador.
- **No guardes usuarios ni contraseñas en el repositorio.** `supabase/seed.sql` es solo para
  entornos de prueba y las cuentas que documentaba deben considerarse comprometidas.
- Las operaciones del inversor (alta de inversión y solicitud de retiro) pasan por
  server actions en `src/app/portal/actions.ts`: el navegador no puede fijar su propia tasa
  ni cambiar el estado de un contrato.
- La pantalla pública de firma usa las funciones `get_contract_for_signing` y `sign_contract`,
  acotadas al token; no hay políticas abiertas sobre `contracts` ni `profiles`.
- El service worker (`public/sw.js`) nunca cachea respuestas de datos ni de otros orígenes.

## Despliegue

Push a `master` → Vercel despliega automáticamente. Las variables de entorno son las de
`.env.local.example` y deben estar cargadas en Vercel **antes** del build.
