# Despliegue

Estado: el servidor se desplegó el 2026-11-19 con los pasos 1 y 2 de esta guía, con un Gmail como SMTP. Se comprobó desde afuera que las funciones exigen sesión y que la API de datos no entrega tablas. Falta que alguien inicie sesión con un correo real.

## 1. Proyecto de Supabase

Lo crea la persona dueña del proyecto con su cuenta. Con el proyecto creado, desde la raíz del repositorio:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref>
pnpm exec supabase db push --remote --dry-run
pnpm exec supabase db push --remote
pnpm exec supabase secrets set SERVER_SECRET="$(openssl rand -base64 32)" --remote=<ref>
pnpm exec supabase functions deploy --remote
```

Cada comando dice a qué proyecto apunta antes de escribir ("Target: project ..."). Si la cuenta tiene más de un proyecto, léelo antes de confirmar.

`SERVER_SECRET` no se guarda en ningún otro lugar. Si se pierde, basta generar otra: los códigos de todas las familias cambian en ese momento (ver `docs/motor-de-codigos.md`).

## 2. Configuración del proyecto

`supabase/config.toml` describe el entorno local y trae valores que no deben llegar al proyecto alojado, como poder pedir un correo por segundo. Lo que el proyecto alojado necesita está en `despliegue/supabase/config.toml`, y se sube sin tocar nada más:

```bash
pnpm exec supabase config diff --remote=<ref> --workdir despliegue
pnpm exec supabase config push --remote=<ref> --workdir despliegue
```

| Qué deja | Por qué |
|---|---|
| API: solo el esquema `app` expuesto | Sin esto las funciones fallan con `internal_error`, y con `public` expuesto las tablas quedarían a la vista de la API. |
| Código por correo de 6 dígitos, vence en 600 segundos | Es lo que la aplicación pide escribir. |
| Plantillas "Magic Link" y "Confirm signup" con `supabase/templates/codigo.html` | La plantilla que trae Supabase manda un enlace y no muestra el código: con ella no se puede entrar. |

**SMTP propio, antes de las plantillas.** En el plan gratis Supabase rechaza el cambio de plantillas mientras el proyecto use su correo incluido (`entitlement_required`, `auth.email_templates`), y rechaza junto con ellas el resto de la configuración de Auth. El SMTP se configura en el panel (Authentication, Emails, SMTP Settings) porque lleva una contraseña. Después se corre el `config push` de arriba.

`config push` solo acepta plantillas dentro de su carpeta de trabajo, así que `despliegue/supabase/templates/codigo.html` es una copia de la que prueba el CI. El test `tests/despliegue.test.ts` falla si dejan de ser iguales.

## 3. Aplicación web

Variables de entorno del sitio (las dos son públicas):

```
VITE_SUPABASE_URL=https://<ref-del-proyecto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Sin ellas la aplicación se construye en modo muestra. `pnpm build && pnpm check:bundle` antes de publicar: el segundo comando falla si el bundle contiene una llave secreta.

El sitio necesita HTTPS. Los enlaces de invitación usan la dirección desde la que se abre la aplicación.

## 4. Comprobación después de desplegar

1. Entrar con un correo real y recibir el código.
2. Crear una familia y ver el código del día.
3. Invitar a una segunda persona y comprobar que ve el mismo código.
4. Con la sesión de esa segunda persona, intentar leer `https://<ref>.supabase.co/rest/v1/families`: debe responder un error.

## Sitios publicados

Los dos salen de la rama `gh-pages`.

- https://mavericksantander.github.io/Santoysena/ es la aplicación en modo muestra. No usa ningún servidor.
- https://mavericksantander.github.io/Santoysena/app/ es la aplicación conectada al proyecto alojado, construida con `vite build --base=./` y copiada a la carpeta `app/`.
