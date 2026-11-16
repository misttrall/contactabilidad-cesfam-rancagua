# Manual de operación — BusinessHub Salud (MVP)

Para quien despliega y mantiene el sistema. Complementa [PLAN_MVP.md](PLAN_MVP.md) y [ADR-001](ADR-001-stack-y-hl7.md).

## 1. Ambientes

| Ambiente | Para qué | Datos | WhatsApp | Identidad |
|---|---|---|---|---|
| **local** | desarrollo (`docker compose up -d` + `pnpm dev`) | ficticios | simulador | realm de desarrollo (`infra/keycloak/realm.json`) |
| **DEMO** | demostraciones al cliente y capacitación | **solo ficticios** («Restablecer datos demo» disponible) | simulador | realm generado, con usuarios creados a mano |
| **QA** | pruebas de aceptación y pruebas con funcionarias | ficticios; nunca planillas reales | simulador o número de prueba de Meta | realm generado (MFA) |
| **PRODUCCION** | piloto real | reales (requiere convenio y base legal: ver [privacidad](privacidad/REGISTRO_TRATAMIENTO.md)) | `cloud` (obligatorio) | realm generado (MFA) |

Reglas que el software hace cumplir (no dependen de que alguien las recuerde): en PRODUCCION `KEYCLOAK_ISSUER` debe ser `https`, `WHATSAPP_MODO=cloud`, y `DATA_ENCRYPTION_KEY` y `REDIS_URL` son obligatorias; «Restablecer datos demo» responde 403 fuera de DEMO.

**Hosting del piloto (decisión del cliente, 2026-11-16):** el piloto se publica en **Cloudflare** (gratuito) **solo con datos ficticios**; si resulta bien, se despliega en **Google Cloud, región de Santiago**, que es donde pueden vivir datos reales. Ver las restricciones de Cloudflare en el [plan de despliegue](#hosting-del-piloto). Todo se aloja en una **región de Chile** (con datos reales) del proveedor (residencia de datos), en una red privada: Postgres y Redis **no** exponen puertos hacia afuera.

## Hosting del piloto

Decisión del cliente (2026-11-16): el piloto va en **Cloudflare** por costo (gratuito) y, si funciona, pasa a **Google Cloud (región de Santiago)**.

| Etapa | Dónde | Datos | WhatsApp |
|---|---|---|---|
| Piloto DEMO/QA | Cloudflare (+ una máquina Linux para el backend, ver abajo) | **solo ficticios** | simulador |
| Piloto real (si prospera) | Google Cloud `southamerica-west1` (Santiago) | reales, con convenio y base legal | `cloud` (un solo número para todos los Cesfam) |

**Arquitectura elegida: web en Cloudflare Pages + backend en una máquina (VM) con túnel.**
El MVP no es solo una web: necesita un servicio Node (NestJS), PostgreSQL, Redis y Keycloak, y eso no corre en Pages ni en Workers tal como está (hasta donde sé; confirmar los límites vigentes del plan gratuito). Por eso:

```
Navegador ──► Cloudflare Pages (web estática, app.<dominio>)
    │
    └──────► Cloudflare Tunnel ─► VM Linux con Docker Compose
                                   ├─ api (NestJS)        ← api.<dominio>
                                   ├─ keycloak            ← id.<dominio>
                                   └─ postgres + redis    (solo red interna)
```

**Paso a paso (piloto DEMO, datos ficticios):**

1. **Máquina:** una VM o servidor Linux con Docker y Docker Compose (servidor del municipio o una VM barata; ≥ 2 vCPU y 4 GB). Sin puertos abiertos a internet.
2. **Dominio y túnel:** en Cloudflare (Zero Trust → Tunnels) crear un túnel y copiar su token a `TUNNEL_TOKEN`. Hostnames públicos: `api.<dominio>` → `http://api:3000` e `id.<dominio>` → `http://keycloak:8080`.
3. **Realm de Keycloak** apuntando a la URL de Pages: `node infra/keycloak/generar-realm.mjs --web https://app.<dominio> --ambiente QA > infra/despliegue/realm-generado.json` (con `KC_ADMIN_SECRET` en el entorno).
4. **Backend:** completar `.env.qa` (`AMBIENTE=DEMO`, `PUBLIC_API_URL=https://api.<dominio>`, `WEB_ORIGIN=https://app.<dominio>`, `KEYCLOAK_ISSUER=https://id.<dominio>/realms/businesshub`, `KEYCLOAK_ORIGEN=https://id.<dominio>`, `KC_HOSTNAME=id.<dominio>`, `WHATSAPP_MODO=simulador`) y levantar con el perfil del túnel:
   `docker compose --env-file .env.qa -f docker-compose.qa.yml --profile tunel up -d --build` y luego `… run --rm migrar` y `… exec api node_modules/.bin/tsx prisma/seed.ts` (o la semilla desde la web con «Restablecer datos demo»).
5. **Web en Pages:** conectar el repositorio (o subir `dist`) con el comando `pnpm install --frozen-lockfile && pnpm --filter @bh/shared --filter @bh/ui build && pnpm --filter @bh/web build`, directorio de salida `apps/web/dist` y variables `VITE_AMBIENTE=DEMO`, `VITE_API_URL=https://api.<dominio>`, `VITE_KEYCLOAK_ISSUER=https://id.<dominio>/realms/businesshub`, **Node 22** (`NODE_VERSION=22`). Después del build, generar las cabeceras:
   `node infra/despliegue/cloudflare-pages/generar-headers.mjs --api https://api.<dominio> --id https://id.<dominio> > apps/web/dist/_headers` (añadirlo al comando de build). Es la misma CSP que usa nginx, con prueba automática.
6. **Verificar:** `https://api.<dominio>/health`, ingreso desde `https://app.<dominio>` y la [guía de pruebas](GUIA_PRUEBAS.md).
7. **Respaldos:** `infra/respaldo/respaldar.sh` en la VM (cron diario) y copia fuera de la máquina.

**Límites a recordar:** (a) el tráfico pasa por Cloudflare (fuera de Chile) y la VM puede estar donde sea: **por eso solo datos ficticios**; (b) un único punto de falla (una máquina) y sin alta disponibilidad: aceptable para un piloto; (c) el túnel reemplaza al balanceador, y `TRUST_PROXY=1` ya está en el compose.

**Regla:** nada con datos reales de pacientes hasta estar en Google Cloud Santiago con convenio firmado y la base legal resuelta. Al migrar: crear el proyecto GCP en `southamerica-west1`, Cloud SQL (PostgreSQL 16) y Memorystore (Redis) o contenedores, Cloud Run/GCE para la API, Keycloak en Cloud Run/GCE con su base; Google Cloud cifra en reposo por defecto (AES-256) los discos y Cloud SQL, y en tránsito; opcionalmente con claves propias (CMEK). Guardar la evidencia (captura de la configuración) en la carpeta de privacidad.

## 2. Despliegue

Referencia en `infra/despliegue/` (Docker Compose; el mismo diseño sirve en Kubernetes).

1. **Secretos:** copiar `infra/despliegue/.env.qa.example` a `.env.qa` y completarlo con valores del gestor de secretos (contraseñas de Postgres y Redis: `openssl rand -hex 32`, porque van dentro de una URL; claves AES: `openssl rand -base64 32`). `.env.qa` no se versiona.
2. **Realm de Keycloak (sin usuarios de prueba, con MFA):**
   ```bash
   KC_ADMIN_SECRET=<el mismo de .env.qa> node infra/keycloak/generar-realm.mjs \
     --web https://app.qa.ejemplo.cl --ambiente QA > infra/despliegue/realm-generado.json
   ```
3. **Levantar y migrar:**
   ```bash
   cd infra/despliegue
   docker compose --env-file .env.qa -f docker-compose.qa.yml up -d --build
   docker compose --env-file .env.qa -f docker-compose.qa.yml run --rm migrar
   ```
4. **Proxy/balanceador:** termina TLS 1.2+ y enruta `app.*` → `web:80`, `api.*` → `api:3000`, `id.*` → `keycloak:8080`. Debe enviar `X-Forwarded-For` (la API usa `TRUST_PROXY=1` para ver la IP real en los límites de tasa y la auditoría).
5. **Crear usuarios** en Keycloak (consola de administración): rol (`funcionaria`, `encargado`, `administrador`) y, para funcionarias, el atributo `centro_id` = código del centro. Cada persona configura su segundo factor en el primer ingreso.
6. **Verificar:** `GET /health` de la API, `GET /healthz` de la web, ingreso de un usuario de cada rol, y el checklist de la [guía de pruebas](GUIA_PRUEBAS.md).

**Migraciones:** `prisma migrate deploy` es un paso de despliegue separado y se ejecuta **antes** de iniciar la versión nueva. Las migraciones son hacia adelante; para volver atrás se restaura el respaldo previo (ver §3).

**Cabeceras de seguridad:** la API (helmet) y nginx (web) envían CSP, HSTS (fuera de DEMO), `nosniff`, `no-referrer` y `frame-ancestors 'none'`. Para embeber la web dentro de AVIS, fijar `CSP_FRAME_ANCESTORS='self' https://<origen-de-avis>` en `.env.qa`.

## 3. Respaldos y restauración

- **Qué se respalda:** la base `businesshub` (incluye la bitácora de auditoría). Keycloak tiene su propia base (`keycloak-db`) y se respalda igual. **No** hay archivos de pacientes en disco (las planillas se procesan en memoria).
- **Cómo:** `infra/respaldo/respaldar.sh` genera `pg_dump` en formato custom, **cifrado** con AES-256 (PBKDF2, 600 000 iteraciones) y una suma SHA-256. La clave del respaldo (≥ 32 caracteres) es **distinta** de `DATA_ENCRYPTION_KEY` y se guarda aparte; sin ella el respaldo es irrecuperable.
  ```bash
  RESPALDO_CLAVE_ARCHIVO=/run/secrets/respaldo.key PG_CONTENEDOR=<contenedor-postgres> \
    infra/respaldo/respaldar.sh /mnt/respaldos
  ```
- **Frecuencia y retención sugeridas (confirmar con el cliente):** diario, 30 días en línea + 12 meses mensuales; copia en otra zona de disponibilidad de la misma región. Los respaldos **contienen datos personales**: caducan junto con la política de retención y se tratan con el mismo control de acceso que la base.
- **Prueba de restauración (obligatoria):** `infra/respaldo/probar-restauracion.sh` respalda, restaura en una base temporal y compara fila a fila (conteo + huella de contenido de las 16 tablas). Ejecutar **mensualmente** y tras cada cambio de esquema; anotar el resultado en la tabla de evidencias.
- **Restaurar de verdad:** `infra/respaldo/restaurar.sh <archivo.dump.enc> <base-nueva>` verifica la suma, descifra y restaura en una base **nueva** (se niega a pisar una existente). Luego se apunta `DATABASE_URL` a ella.
- **RPO/RTO objetivo del piloto:** RPO ≤ 24 h, RTO ≤ 4 h (a validar con el cliente).

| Fecha | Quién | Entorno | Resultado |
|---|---|---|---|
| 2026-11-10 | desarrollo | local | OK: 203 filas en 16 tablas idénticas; clave incorrecta y archivo alterado rechazados |

## 4. Rotación de secretos

| Secreto | Cada | Procedimiento |
|---|---|---|
| `DATA_ENCRYPTION_KEY` (teléfonos) | 12 meses o ante sospecha de filtración | 1) generar clave nueva (mientras dura la rotación las búsquedas por teléfono, p. ej. respuestas de WhatsApp, prueban también las huellas de la clave vieja); 2) poner la **nueva** en `DATA_ENCRYPTION_KEY` y la **vieja** en `DATA_ENCRYPTION_KEY_ANTERIORES`; 3) reiniciar la API; 4) `pnpm --filter @bh/api rotar-claves --simular` y luego sin `--simular` (re-cifra y recalcula la huella de búsqueda; es idempotente y reanudable); 5) cuando `fallidos=0`, retirar la clave vieja. Los datos cifrados llevan el id de su clave (`v2:<id>:…`). |
| Clave de respaldos | 12 meses | Se genera una nueva y se usa para los respaldos siguientes; **conservar la anterior mientras existan respaldos cifrados con ella**. |
| `KC_ADMIN_SECRET` (cliente `businesshub-admin`) | 6 meses | Cambiar en Keycloak (Clients → businesshub-admin → Credentials) y en el gestor; reiniciar la API. |
| `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | según Meta / ante sospecha | Regenerar en Meta Business, actualizar el gestor, reiniciar la API (el webhook rechaza firmas del secreto anterior). |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `KC_DB_PASSWORD` | 12 meses | Cambiar en el servicio y en el gestor; reiniciar los dependientes. |

Ante una **filtración**: rotar de inmediato el secreto afectado y seguir el [plan de brechas](privacidad/PLAN_BRECHAS.md). Las claves nunca van en el repositorio, en logs ni en tickets.

## 5. Tareas periódicas

| Tarea | Frecuencia | Cómo |
|---|---|---|
| Retención (anonimizar datos > 12 meses sin citas) | mensual | Configuración → API `POST /api/config/privacidad/retencion` (primero simulando). Ver [política](privacidad/POLITICA_RETENCION.md). |
| Prueba de restauración | mensual | `probar-restauracion.sh` (§3) |
| Revisión de accesos y usuarios inactivos | mensual | Configuración → Usuarios; bitácora `usuario.*` y `acceso.denegado` |
| Revisión de la bitácora de lecturas sensibles | semanal | eventos `paciente.revelar`, `paciente.leer`, `privacidad.*`, `reporte.exportar` |
| Actualización de dependencias y revisión de CVE | mensual | `pnpm audit`, imágenes base |
| Revisión de versiones de CL Core / Agenda APS | por hito | `packages/fhir/ig/versions.json` y el job `fhir-validator` |

## 6. Monitoreo e incidentes

- **Salud:** `GET /health` (API) y `GET /healthz` (web) para el balanceador. Alertar si hay 5xx sostenidos, la cola de envíos crece sin drenar o falla el webhook de WhatsApp.
- **Registros (logs):** la API no escribe RUT, teléfonos ni nombres (DoD §5 del plan); los errores del proveedor de WhatsApp guardan solo el código. Retención de logs: 90 días.
- **Límites de tasa** (ventana de 1 min): **por usuario autenticado** general 600, cargas 10, revelar RUT/teléfono 60, crear envíos 20, exportar reportes 10; **por IP** solo como freno de inundación antes de autenticar (3 000; un Cesfam comparte IP pública, por eso no se limita fino por IP) y el webhook (3 000). Un 429 trae `Retry-After`. Con **más de una instancia** de la API los contadores en memoria no se comparten: pasar el limitador a Redis antes de escalar horizontalmente. `TRUST_PROXY` (nº de proxies, validado al arrancar) hace que la API vea la IP real.
- **Incidente de seguridad o de datos personales:** seguir [PLAN_BRECHAS.md](privacidad/PLAN_BRECHAS.md).
- **WhatsApp caído o sin plantilla aprobada:** los envíos fallan con un código y quedan visibles; las citas pasan a la lista de llamadas (RN-01: nunca se cancelan por falta de respuesta).

## 7. Pendiente para el piloto real

1. Convenio de tratamiento y base legal con la Dirección de Salud (PLAN_MVP §7.4 y §7.11).
2. Verificación de negocio y plantillas aprobadas en Meta (PLAN_MVP §7.9).
3. Prueba de penetración **externa** (ver [SEGURIDAD_ASVS.md](SEGURIDAD_ASVS.md)): lo hecho aquí es una autoevaluación con pruebas automáticas, no reemplaza a un tercero.
4. Definir RPO/RTO, retención de respaldos y el proveedor/región concretos.
5. Disco cifrado del proveedor para los volúmenes de Postgres/Redis (comprobar que esté activo y documentarlo).
