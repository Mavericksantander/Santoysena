# Santo y Seña

Verificación de identidad familiar con un código compartido que cambia cada día.

Cuando alguien llama diciendo ser un familiar, se le pide el Santo y Seña de hoy. Si no lo sabe, su identidad no está verificada. La aplicación no detecta voces clonadas ni deepfakes: agrega una verificación independiente.

Gratis, sin publicidad, sin venta de datos, de código abierto (AGPL-3.0).

> La confianza no se presume. Se verifica.

## Estado

Fase 1 de 6 (base del proyecto). **Todavía no hay autenticación, familias ni generación de códigos.**

| Fase | Contenido | Estado |
|---|---|---|
| 1. Base | Repositorio, React + TypeScript + Vite + Tailwind, esquema de base de datos, CI | Hecha |
| 2. Autenticación y familias | Código por correo, familias, invitaciones, roles, RLS | Pendiente |
| 3. Motor de códigos | Lista de palabras, HMAC-SHA256, rotación a medianoche | Pendiente |
| 4. Frontend | Panel, familia, instrucciones, PWA | Pendiente |
| 5. Endurecimiento | Rate limiting, revisión de RLS, auditoría | Pendiente |
| 6. Publicación | Documentación, política de privacidad, despliegue | Pendiente |

## Límites de seguridad

- Dos palabras de una lista de 4.096 dan unos 24 bits. Disuade a quien intenta adivinar en una llamada; no reemplaza una autenticación digital fuerte.
- Si la cuenta o el teléfono de un familiar se ve comprometido, el atacante puede ver el código. Para eso existirá la expulsión de emergencia, que cambia el código al instante.
- Un código correcto no autoriza por sí solo una transferencia. Ante pedidos de dinero, llama al familiar a un número que ya conocías.

## Desarrollo

Requisitos: Node 22 o superior y pnpm 10. Para levantar Supabase local se necesita además Docker.

```bash
pnpm install
pnpm dev
```

Gates que deben pasar antes de cada commit:

```bash
pnpm lint
pnpm typecheck
TZ=UTC pnpm test
TZ=America/Santiago pnpm test
pnpm build
```

## Estructura

```
src/                  Frontend (React)
supabase/migrations/  Esquema de la base. Todo cambio de esquema es una migración nueva.
supabase/functions/   Edge Functions (desde la fase 2)
tests/db/             Tests del esquema sobre Postgres en memoria (PGlite)
```

## Decisiones de arquitectura

1. **El cliente no tiene privilegios sobre las tablas.** Los roles `anon` y `authenticated` no pueden leer ni escribir nada, y las tablas futuras nacen igual. Todo pasa por Edge Functions que validan sesión y membresía. RLS queda activo como segunda barrera. Lo verifican los tests de `tests/db/schema.test.ts`: una tabla nueva sin RLS o con permisos para el cliente hace fallar la suite.
2. **No se guardan códigos.** El código se deriva al vuelo con HMAC-SHA256 del secreto del servidor sobre familia, fecha local, `code_epoch` y versión. No existe tabla de historial y un test falla si aparece una tabla no esperada.
3. **`code_epoch` por familia.** Expulsar a alguien no sirve si el código de hoy sigue vigente hasta medianoche. Incrementar `code_epoch` cambia el código de inmediato.
4. **Las reglas viven en la base.** Rol válido, membresía única, zona horaria IANA válida y formato del hash de invitación son constraints de Postgres, no validaciones del cliente.
5. **Invitaciones sin token en claro.** Solo se guarda el SHA-256 del token; el constraint de formato rechaza cualquier otra cosa.
6. **Tests del esquema en PGlite.** Aplican las migraciones reales sobre Postgres en memoria con un stub mínimo de Supabase (`tests/db/supabase-stub.sql`), sin Docker. El CI además aplica las migraciones en Supabase local.

## Secretos

Nunca se versionan `.env` ni llaves. En el cliente solo van la URL y la anon key de Supabase. La service-role key y `SERVER_SECRET` viven únicamente en las variables de entorno de las Edge Functions.

## Licencia

[AGPL-3.0](LICENSE)
