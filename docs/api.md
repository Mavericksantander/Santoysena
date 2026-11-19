# API (Edge Functions)

Todas las funciones son `POST` con cuerpo JSON y exigen una sesión de usuario en `Authorization: Bearer <token>`. Sin sesión válida responden 401. Las respuestas llevan `cache-control: no-store`.

| Función | Entrada | Respuesta 200 |
|---|---|---|
| `create-family` | `name`, `timezone` (opcional, por defecto `America/Santiago`) | `family_id` |
| `create-invitation` | `family_id`, `ttl_seconds` (opcional, de 300 a 604800, por defecto 86400) | `token`, `expires_at` |
| `accept-invitation` | `token` | `family_id` |
| `list-family-members` | `family_id` | `members`: `user_id`, `display_name`, `role`, `is_owner`, `joined_at` |
| `remove-family-member` | `family_id`, `user_id` | objeto vacío |
| `set-member-role` | `family_id`, `user_id`, `role` (`admin` o `member`) | objeto vacío |

El actor siempre sale de la sesión. Ningún campo del cuerpo permite actuar a nombre de otra persona.

## Errores

El cuerpo de un error es `{ "code": "..." }`. Nunca incluye mensajes de la base.

| Código | Estado | Significado |
|---|---|---|
| `invalid_input` | 400 | Un campo falta o tiene mala forma. Cuando se sabe cuál, viene en `field`. |
| `invalid_ttl` | 400 | Plazo de invitación fuera de rango. |
| `not_a_member` | 403 | No eres miembro de esa familia, o la familia no existe. No se distingue. |
| `not_an_admin` | 403 | La acción es solo para administradores. |
| `cannot_change_own_role` | 403 | Nadie cambia su propio rol. |
| `cannot_change_owner_role` | 403 | El dueño siempre es administrador. |
| `cannot_remove_owner` | 403 | El dueño no puede ser expulsado ni irse. |
| `invitation_invalid` | 404 | Invitación desconocida, usada, vencida, anulada o con mala forma. No se distingue. |
| `target_not_a_member` | 404 | La persona indicada no es miembro de la familia. |
| `already_a_member` | 409 | Ya eres miembro; la invitación no se gastó. |
| `method_not_allowed` | 405 | Solo se acepta `POST`. |
| `internal_error` | 500 | Falla inesperada. No lleva detalle. |

## Token de invitación

32 bytes aleatorios en base64url (43 caracteres). Se entrega una sola vez, en la respuesta de `create-invitation`. La base solo guarda su SHA-256.
