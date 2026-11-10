# Keycloak (identidad)

`realm.json` es el realm de **DESARROLLO / DEMO** (Keycloak no admite comentarios en este archivo, por eso la nota va aquí):

- Usuarios y contraseñas **ficticios**, solo para entorno local. Contraseña común de desarrollo: `Demo-1234!`.
- El cliente `businesshub-dev-cli` (usuario + contraseña) existe solo para pruebas automatizadas locales. **No debe existir** en QA/PRODUCCION.
- El cliente `businesshub-admin` (cuenta de servicio con `manage-users`) permite administrar usuarios desde el sistema; su secreto del realm de desarrollo es público. **En QA/PRODUCCION debe crearse con un secreto propio** y entregarse por `KEYCLOAK_ADMIN_CLIENT_ID/SECRET`.
- El realm de QA/PRODUCCION se define en S6: secretos por gestor, MFA obligatorio, URLs `https`, sin cliente dev-cli.

| Usuario | Rol | Centro (`centro_id`) |
|---|---|---|
| `funcionaria.csc` | funcionaria | CSC |
| `funcionaria.csn` | funcionaria | CSN |
| `encargado.demo` | encargado | todos |
| `admin.demo` | administrador | todos |
| `sinrol.demo` | (ninguno) | — para probar el 403 |

El claim `centro_id` es el **código** del centro (`centro.codigo` en la base). El claim de roles es `realm_access.roles`.

`theme/businesshub/login` aplica los tokens de la skill `diseno-clinico-avis` a la pantalla de inicio de sesión.

## Cambios en el realm

Keycloak solo importa el realm si no existe. Para reimportar en local: `docker compose rm -sf keycloak && docker compose up -d keycloak` (los datos de `start-dev` son efímeros).
