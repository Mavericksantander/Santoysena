# Santo y Seña

Verificación de identidad familiar con un código compartido que cambia cada día.

Cuando alguien llama diciendo ser un familiar, se le pide el Santo y Seña de hoy. Si no lo sabe, su identidad no está verificada. La aplicación no detecta voces clonadas ni deepfakes: agrega una verificación independiente.

Gratis, sin publicidad, sin venta de datos, de código abierto (AGPL-3.0).

> La confianza no se presume. Se verifica.

## Estado

Fases 1 a 3 hechas en el servidor: familias, invitaciones, roles, inicio de sesión y el generador del código diario. **Todavía no hay interfaz**, y la lista de palabras espera la revisión de una persona.

| Fase | Contenido | Estado |
|---|---|---|
| 1. Base | Repositorio, React + TypeScript + Vite + Tailwind, esquema de base de datos, CI | Hecha |
| 2. Autenticación y familias | Código por correo, familias, invitaciones, roles, RLS | Hecha en el servidor; la interfaz va en la fase 4 |
| 3. Motor de códigos | Lista de palabras, HMAC-SHA256, rotación a medianoche | Hecha; falta revisión humana de la lista |
| 4. Frontend | Panel, familia, instrucciones, PWA | En curso: las tres pantallas corren en modo muestra; falta conectarlas al servidor |
| 5. Endurecimiento | Rate limiting, revisión de RLS, auditoría | Pendiente |
| 6. Publicación | Documentación, política de privacidad, despliegue | Pendiente |

## Límites de seguridad

- Dos palabras de una lista de 4.096 dan unos 24 bits. Disuade a quien intenta adivinar en una llamada; no reemplaza una autenticación digital fuerte.
- Si la cuenta o el teléfono de un familiar se ve comprometido, el atacante puede ver el código. Para eso existirá la expulsión de emergencia, que cambia el código al instante.
- Un código correcto no autoriza por sí solo una transferencia. Ante pedidos de dinero, llama al familiar a un número que ya conocías.

## Desarrollo

Requisitos: Node 22 o superior y pnpm 10. Para levantar Supabase local se necesita además Docker y una llave de desarrollo: `export SERVER_SECRET="$(openssl rand -base64 32)"`.

```bash
pnpm install
pnpm dev
```

Hoy la aplicación solo corre en **modo muestra**: usa datos de ejemplo y lo avisa en una franja amarilla en todas las pantallas. Para verla en un teléfono de la misma red wifi: `pnpm dev --host` y abrir la dirección de red que imprime.

Gates que deben pasar antes de cada commit:

```bash
pnpm lint
pnpm typecheck
pnpm check:functions
TZ=UTC pnpm test
TZ=America/Santiago pnpm test
pnpm build
pnpm check:bundle
```

Los tests de integración (`pnpm test:integration`) necesitan `supabase start` y las variables de `supabase status -o env`. El CI los corre en cada PR.

## Estructura

```
src/                  Frontend (React). src/data/source.ts es la única puerta hacia el servidor.
supabase/migrations/  Esquema de la base. Todo cambio de esquema es una migración nueva.
supabase/functions/   Edge Functions. La lógica está en _shared; cada función es una línea.
supabase/templates/   Correo con el código de inicio de sesión
tests/db/             Tests del esquema y de las reglas (PGlite local, Supabase real en CI)
tests/functions/      Tests de las Edge Functions, con sesiones firmadas localmente
tests/integration/    Tests contra un Supabase local completo (CI)
docs/api.md           Funciones, entradas y códigos de error
docs/motor-de-codigos.md   Algoritmo, vencimiento y rotación de la llave
docs/lista-de-palabras.md  Criterios y fuentes de las 4.096 palabras
docs/estados.md       Statecharts de invitación y membresía con sus invariantes
```

## Decisiones de arquitectura

1. **El cliente no tiene privilegios sobre las tablas.** Los roles `anon` y `authenticated` no pueden leer ni escribir nada, y las tablas futuras nacen igual. Todo pasa por Edge Functions que validan sesión y membresía. RLS queda activo como segunda barrera. Lo verifican los tests de `tests/db/schema.test.ts`: una tabla nueva sin RLS o con permisos para el cliente hace fallar la suite.
2. **No se guardan códigos.** El código se deriva al vuelo con HMAC-SHA256 del secreto del servidor sobre familia, fecha local, `code_epoch` y versión. No existe tabla de historial y un test falla si aparece una tabla no esperada.
3. **`code_epoch` por familia.** Expulsar a alguien no sirve si el código de hoy sigue vigente hasta medianoche. Incrementar `code_epoch` cambia el código de inmediato.
4. **Las reglas viven en la base.** Rol válido, membresía única, zona horaria IANA válida y formato del hash de invitación son constraints de Postgres, no validaciones del cliente.
5. **Invitaciones sin token en claro.** Solo se guarda el SHA-256 del token; el constraint de formato rechaza cualquier otra cosa.
6. **La misma suite corre en dos bases.** En local aplica las migraciones reales sobre Postgres en memoria (PGlite) con un stub mínimo de Supabase, sin Docker. En CI corre contra Supabase local con `TEST_DATABASE_URL`, para que el stub no pueda esconder una diferencia.
7. **La autorización vive en funciones SQL del esquema `app`.** Reciben al actor de forma explícita y solo `service_role` puede ejecutarlas. Las Edge Functions autentican y delegan. Los estados válidos están en [docs/estados.md](docs/estados.md).

8. **La API de datos solo expone el esquema `app`.** El cliente nunca consulta tablas: `public` no está expuesto y `app` solo lo puede usar `service_role`. Al desplegar en un proyecto alojado hay que repetir esa configuración en el panel (esquemas expuestos y plantillas de correo).
9. **Inicio de sesión con código de 6 dígitos por correo**, válido 10 minutos. Sin contraseñas y sin enlaces, porque en iOS un enlace abre Safari y no la aplicación instalada.

## Secretos

Nunca se versionan `.env` ni llaves. En el cliente solo van la URL y la anon key de Supabase. La llave secreta y `SERVER_SECRET` viven únicamente en las variables de entorno de las Edge Functions. `pnpm check:bundle` falla si alguna aparece en el bundle del cliente.

## Licencia

[AGPL-3.0](LICENSE)
