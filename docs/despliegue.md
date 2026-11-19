# Despliegue

Estado: **nunca se ha desplegado**. Los pasos de esta guía no están verificados contra un proyecto alojado; lo verificado es lo que corre el CI contra un Supabase local. Corrige esta guía la primera vez que se use.

## 1. Proyecto de Supabase

Lo crea la persona dueña del proyecto con su cuenta. Con el proyecto creado, desde la raíz del repositorio:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <ref-del-proyecto>
pnpm exec supabase db push
pnpm exec supabase secrets set SERVER_SECRET="$(openssl rand -base64 32)"
pnpm exec supabase functions deploy
```

`SERVER_SECRET` no se guarda en ningún otro lugar. Si se pierde, basta generar otra: los códigos de todas las familias cambian en ese momento (ver `docs/motor-de-codigos.md`).

## 2. Configuración que hay que repetir en el panel

`supabase/config.toml` describe el entorno local. En el proyecto alojado hay que dejar lo mismo:

| Dónde | Qué |
|---|---|
| API, esquemas expuestos | Solo `app`. Quitar `public` y `graphql_public`. |
| Auth, proveedor de correo | Activado, con registro de usuarios permitido. |
| Auth, código por correo | 6 dígitos, vence en 600 segundos. |
| Auth, plantillas "Magic Link" y "Confirm signup" | Asunto y contenido de `supabase/templates/codigo.html`. Deben mostrar `{{ .Token }}` y ningún enlace. |
| Auth, SMTP propio | Obligatorio. El correo incluido en Supabase solo envía a los miembros del equipo del proyecto y tiene un límite muy bajo por hora. |

Sin el primer punto las funciones fallan con `internal_error`, porque no pueden llamar al esquema `app`.

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

## Muestra pública

https://mavericksantander.github.io/Santoysena/ es la aplicación en modo muestra, publicada desde la rama `gh-pages`. No usa ningún servidor.
