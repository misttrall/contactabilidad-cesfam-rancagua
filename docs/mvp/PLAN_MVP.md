# Plan de desarrollo del MVP — BusinessHub Salud (Contactabilidad CESFAM Rancagua)

| Campo | Valor |
|---|---|
| Rama | `feat/mvp` (desde `master` @ 0828813) |
| Base documental | Informe Técnico BusinessHub Salud v1.0 (10-11-2026) |
| Decisiones técnicas | [ADR-001 — Stack e interoperabilidad HL7 FHIR](ADR-001-stack-y-hl7.md) |
| Diseño | Skill `.claude/skills/diseno-clinico-avis` |
| Equipo | 5 integrantes · sprints de 2 semanas |

## 1. Objetivo del MVP

Pasar del prototipo navegable (todo simulado) a un **sistema funcional con backend, persistencia, autenticación por rol/centro, WhatsApp real en modo de prueba e interoperabilidad HL7 FHIR R4**, apto para un **piloto controlado en un Cesfam** con datos ficticios primero y, tras el convenio con la Dirección de Salud, con datos reales.

**Criterio de éxito del MVP:** una funcionaria puede, en su sesión, cargar la planilla de AVIS, enviar la confirmación masiva, ver respuestas Sí/No llegar solas, llamar solo a los pendientes y registrar llamadas entrantes en < 30 s; el encargado ve reportes reales por centro; todo queda auditado y expuesto como recursos FHIR válidos contra CL Core / Guía de Agenda APS MINSAL.

## 2. Alcance

### Dentro (cubre RF-01 a RF-21 y RNF-01 a RNF-13 del informe, más HL7)
- Autenticación OIDC (Keycloak), roles funcionaria/encargado/administrador y filtrado por centro (RF-01..03).
- Carga real de Excel AVIS con validación por fila, plantilla descargable, exclusión de morbilidad (RF-04..08).
- Confirmación masiva por WhatsApp (Cloud API en número de prueba + modo simulador), recepción de respuestas por webhook, segundo mensaje a adultos mayores (RF-09..12, RN-11, RN-12).
- Cola de pendientes y registro de resultados con forma de contacto y usuario real (RF-13..14).
- Llamada entrante real con búsqueda por RUT validado (RF-15..17).
- Dashboard y reportes calculados, exportación Excel (RF-18..19).
- Configuración persistente: plantillas, centros, usuarios, motivos, parámetros (RF-20); restablecer datos demo (RF-21).
- **HL7 FHIR R4**: fachada `/fhir/R4` con Patient, Practitioner, Organization, Location, Appointment, AppointmentResponse, Task, CommunicationRequest, Communication, Consent, AuditEvent; CapabilityStatement; validación en CI.
- Seguridad y cumplimiento: auditoría, cifrado, cabeceras, retención, aviso de ambiente.

### Fuera (se mantiene del informe 3.5)
- Escritura/integración directa con AVIS (se deja el adaptador diseñado: FHIR o HL7 v2 SIU).
- Telefonía integrada (marcador/registro automático).
- Lanzamiento SMART on FHIR desde AVIS (se diseña la UI embebible, no se implementa el launch).

## 3. Hitos y sprints

| Sprint | Semanas | Entregable principal | Requisitos |
|---|---|---|---|
| S0 | 1–2 | Fundaciones | — |
| S1 | 3–4 | Identidad, roles y catálogos | RF-01..03, RF-20 (parcial), RNF-02, RNF-03 |
| S2 | 5–6 | Carga de planilla AVIS → FHIR | RF-04..08, RNF-01, RNF-04 |
| S3 | 7–8 | Confirmación masiva WhatsApp | RF-09..12, RN-03, RN-10..12, RNF-05 |
| S4 | 9–10 | Pendientes y llamadas | RF-13..17, RN-01, RN-05, RN-07..09, RN-13 |
| S5 | 11–12 | Dashboard, reportes, configuración | RF-18..21, RNF-11 |
| S6 | 13–14 | Endurecimiento, conformidad HL7 y piloto | RNF-06..10, RNF-12, cap. 13 |

**Hito H1 (fin S2):** demo interna con carga real. **H2 (fin S4):** flujo A y B de extremo a extremo con datos ficticios → sesión de pruebas con funcionarias (guía cap. 12 actualizada). **H3 (fin S6):** MVP listo para piloto.

### S0 — Fundaciones
**Estado: completado en lo esencial (ver pendientes de traspaso al final de esta sección).**

- [x] `.gitignore` y retiro de `node_modules` del índice (D-14); prototipo movido a `legacy/prototipo/`.
- [x] Monorepo pnpm + Turborepo: `apps/web`, `apps/api`, `packages/{fhir,shared,ui}`; `pnpm turbo run typecheck test build` en verde (31 pruebas).
- [x] `docker-compose` dev: Postgres 16, Redis 7, Keycloak 26, MailPit; `.env.example` sin secretos.
- [x] CI GitHub Actions: `tsc --noEmit`, Vitest y build como gate, más chequeos de "sin planillas/datos reales" y "sin node_modules versionado". *(ESLint/Prettier: pendiente, ver traspaso.)*
- [x] `packages/ui`: tokens de la skill y componentes `EstadoCitaBadge`, `BannerAmbiente`, `RutInput` con pruebas. *(Tailwind v4, Button, TablaClinica y Drawer: S1.)*
- [x] `packages/fhir`: mapeo estado→FHIR con prueba de RN-01, `Patient`, `CapabilityStatement`, ejemplo y validación estructural; `ig/versions.json` creado. *(Fijar versiones de CL Core/Agenda APS y validador oficial: S2/S6.)*
- [x] Datos semilla **claramente ficticios** (`packages/shared/src/semillas.ts`; RUT 1000001-7…, teléfonos +56 9 0000 00xx).
- [x] API NestJS con `/health` y `/fhir/R4/metadata`, helmet y configuración validada al arrancar.

**Pendiente de traspaso a S1:** ESLint + Prettier en CI; Tailwind v4 y componentes restantes; Prisma y migraciones; realm de Keycloak; fijar versiones de las guías FHIR chilenas; `.nvmrc`/Node 22 en producción.

### S1 — Identidad, roles y catálogos
**Estado: completado y verificado de punta a punta** (navegador → API → Keycloak y Postgres reales) con 93 pruebas automáticas.

- [x] Realm Keycloak versionado (`infra/keycloak/realm.json`): roles, atributo `centro_id` como claim, PKCE S256, tema de login con tokens, bloqueo por intentos, sesión de 30 min de inactividad. Ver [infra/keycloak/README.md](../../infra/keycloak/README.md). *(MFA y realm de QA/PROD: S6.)*
- [x] API: `AuthGuard` global (JWT RS256 contra el JWKS de Keycloak, emisor + audiencia) y `ModuloGuard` con la matriz de permisos (tabla 8). El alcance por centro se resuelve en `@bh/shared`; una funcionaria que pide otro centro recibe 403, no un filtro silencioso. *(Se implementó como `@RequiereModulo()` + `resolverAlcance()` en vez de `@Roles()`/`@ScopeCentro()`.)*
- [x] Prisma: `centro`, `usuario` (alta automática desde el token), `profesional`, `motivo_llamada`, `parametro`, `audit_event` con trigger que bloquea UPDATE, DELETE y TRUNCATE (probado en Postgres real). Semilla ficticia idempotente (`pnpm --filter @bh/api db:seed`).
- [x] Auditoría: `sesion.ingreso`, `acceso.denegado` y `motivo.actualizar` (con el detalle del cambio).
- [x] Shell web: login OIDC (tokens en `sessionStorage`), menú filtrado por rol, ruta protegida por módulo («Sin acceso»), banner de ambiente, menú contraído a ≤ 960 px (probado a 640 px), pantalla de Configuración con centros y activación de motivos.
- [x] FHIR: `Organization`, `Location`, `Practitioner`, `PractitionerRole` (búsqueda y lectura con alcance por centro; un centro ajeno responde 404) y `CodeSystem` `motivo-llamada` (desde la BD), `resultado-llamada`, `tipo-cita`, `estado-contacto`. El `CapabilityStatement` declara solo lo implementado.
- [x] ESLint + Prettier en el CI (`pnpm lint`, `pnpm format:check`).

**Decisiones tomadas en S1**
- **Sin Tailwind por ahora:** los componentes usan CSS con los tokens de la skill (una sola fuente de verdad, sin duplicar el sistema de diseño). Radix UI se incorpora cuando aparezcan componentes complejos (Drawer/Dialog en S3–S4).
- **Funcionaria sin centro = acceso denegado.** Corrige la RN-13 del prototipo («sin centro = todos»), que filtraría datos de otros centros si faltara configurar a una funcionaria.
- `audit_event.usuarioId` guarda el `sub` de Keycloak (estable aunque se reconstruya la base).

**Pendiente a futuro de S1:** código DEIS de cada centro (CL Core identifica establecimientos por DEIS; hoy se usa un código local, ver §7); `parametro` aún sin endpoints de edición (llega con S3, cuando se usan); gestión de usuarios y asignación de centro desde la UI (hoy en Keycloak).

### S2 — Carga de planilla AVIS
**Estado: completado y verificado de punta a punta** (planilla `.xlsx` real subida desde el navegador → Postgres) con 179 pruebas, 21 de ellas contra PostgreSQL real.

- [~] **Columnas reales de AVIS: sigue pendiente con el Cesfam (bloqueante para el piloto).** Mientras tanto el lector reconoce las columnas del informe y variantes comunes (sin distinguir mayúsculas ni tildes); cuando se conozca el formato real basta agregar alias en [planilla.ts](../../packages/shared/src/planilla.ts).
- [x] `POST /api/cargas/validar` y `POST /api/cargas` (multipart, 5 MB, `.xlsx/.xls`). SheetJS **0.20.3** desde cdn.sheetjs.com (corrige CVE-2023-30533 y CVE-2024-22363), en memoria: el archivo ni su nombre se guardan. Se valida la firma real del archivo (no solo la extensión), se rechazan macros, no se evalúan fórmulas y se limita a 5.000 filas.
- [x] Validación por fila: RUT módulo 11, teléfono, fecha y hora (acepta números de Excel y `DD-MM-AAAA`), tipo, columnas opcionales (fecha de nacimiento, sexo). Informa **todos** los errores de cada fila con su número de fila de Excel y la columna. Morbilidad excluida por defecto (parámetro `carga.excluir_morbilidad_por_defecto`).
- [x] **Idempotencia** (centro + paciente + fecha + hora + profesional): recargar la planilla no duplica citas ni reinicia su estado de contacto. Dos cargas simultáneas del mismo centro se serializan con un bloqueo de PostgreSQL (probado).
- [x] Persistencia: `paciente` (teléfono cifrado AES-256-GCM), `cita`, `tarea_contacto` (`sin_enviar`) y `carga` (solo conteos). La auditoría `carga.importar` no lleva RUT, nombres ni teléfonos. 1.000 filas se importan en menos de 1 s.
- [x] FHIR: `construirBundleCarga` arma el Bundle *transaction* (Patient con PUT condicional por RUN, Appointment con creación condicional por un identificador *hash*, Task `sin-enviar`) y se valida estructuralmente. Además la API sirve `Appointment?date=&location=` y `Patient?identifier=` (con alcance por centro; leer un paciente queda auditado). *El Bundle es la representación de intercambio para el adaptador hacia AVIS (S6); en el MVP la fuente de verdad es la base relacional.*
- [x] Plantilla descargable con datos ficticios que se vuelve a cargar sin errores (probado). UI de 3 pasos (centro y archivo → revisión → resultado) con vista previa enmascarada, tabla de errores, historial de cargas y modo angosto.

**Decisiones tomadas en S2**
- **Validar e importar son dos llamadas sin estado en el servidor:** el navegador mantiene el archivo entre el paso 2 y el 3, y la importación vuelve a validar todo. Así no queda ningún dato de pacientes «en espera» en el servidor.
- **Las filas con errores no bloquean:** se importan las válidas y se informa claramente cuántas quedaron fuera.
- **La planilla es la fuente de los datos de contacto:** si cambia el teléfono de un paciente, se actualiza.
- **Clave de cifrado** (`DATA_ENCRYPTION_KEY`): obligatoria fuera de DEMO; en DEMO hay una clave pública de desarrollo.
- **El CI falla si no hay base de pruebas** (antes las pruebas de integración se omitían en silencio al pasar por Turborepo).

**Pendiente a futuro de S2:** edad o fecha de nacimiento en la exportación de AVIS (sin ella no se puede priorizar a adultos mayores en S4); confirmar si AVIS repite el RUT con formato distinto; límite de tasa en la carga (S6).

### S3 — Confirmación masiva por WhatsApp
**Estado: completado y verificado de punta a punta** con Redis y Postgres reales (carga → envío por la cola BullMQ → respuestas simuladas → tabla de estados → liberaciones). 286 pruebas, de ellas 69 de integración contra PostgreSQL y 8 contra Redis.

> **Lo que NO se pudo verificar sin credenciales de Meta:** el envío real por la Cloud API y la aprobación de las plantillas. El cliente está probado contra respuestas simuladas (formato de la solicitud y clasificación de errores). Para el piloto hay que: crear la app en Meta Business, **verificar el negocio y aprobar las plantillas** `confirmacion_hora_v1` y `recordatorio_hora_v1` (cuerpo con 3 parámetros: centro, fecha y hora, y dos botones de respuesta rápida) y registrar el webhook. Es un trámite que puede tardar: conviene iniciarlo ya.

- [x] **Canal intercambiable** (`CanalMensajeria`): `SimuladorWhatsApp` para la demo y `CloudApiWhatsApp` (WhatsApp Business Platform). En PRODUCCIÓN solo se admite `cloud`, con sus cuatro credenciales obligatorias. Errores 4xx → permanentes; 429, 5xx y fallas de red → transitorios (se reintentan).
- [x] **Plantillas sin datos personales ni clínicos:** el mensaje lleva solo el centro, la fecha y la hora (sin nombre, profesional ni prestación, que podría revelar un diagnóstico). Resuelve la inconsistencia «Mañana…» vs «1 mes» de 9.3: la anticipación es un parámetro (`envio.anticipacion_horas`) y la fecha va explícita.
- [x] **Cola BullMQ (Redis):** lotes, límite de tasa configurable, reintentos con espera exponencial (5 intentos), diferidos fuera del horario, deduplicación y continuidad tras un reinicio (probado). En desarrollo sin `REDIS_URL` corre una cola en memoria; fuera de DEMO Redis es obligatorio.
- [x] **Horario de envío** (`envio.ventana_horaria`, hora de Chile): fuera de él los mensajes esperan al próximo inicio; el procesador lo vuelve a comprobar al enviar.
- [x] **Nunca se envía dos veces** a la misma cita (unicidad cita+tipo en la base, probado con envíos en paralelo).
- [x] **Webhook firmado:** `X-Hub-Signature-256` (HMAC-SHA256 sobre el cuerpo crudo, comparación en tiempo constante) y verificación GET. Estados de entrega (`sent/delivered/read/failed`) tolerantes al desorden; `failed` deja la cita para llamar. Respuestas **idempotentes** (Meta reintenta entregas) y solo se acepta la respuesta del teléfono al que se escribió.
- [x] **Respuestas:** «Sí» → confirmada; «No» → cancelada + tarea **«Liberar hora en AVIS»** + mensaje de reagendamiento (texto configurable). Texto libre («Sí», «No puedo») se interpreta con prudencia y solo si ese teléfono tiene **una** cita esperando; lo ambiguo no se adivina. Una respuesta tardía a una cita ya en «Sin respuesta» sí se acepta.
- [x] **Vencimientos** (`envio.horas_espera_respuesta`, barrido cada 5 min): sin respuesta → «Sin respuesta» y a la lista de llamadas, **nunca cancelada** (RN-01). A mitad de la espera, el adulto mayor recibe **un** recordatorio (`envio.segundo_mensaje_adulto_mayor`, RN-12).
- [x] **Baja del canal:** «STOP», «baja» o «no quiero recibir más mensajes» registran la baja del número (todos los pacientes que lo comparten), un `Consentimiento` revocado, y sus citas pasan a llamada. No se confunde con un «No» a la cita.
- [x] **FHIR:** `Communication` (estado del mensaje, sin contenido), `AppointmentResponse` (`accepted`/`declined`), `Task` de contacto y `Task` «liberar-hora-avis», y mapeo a `Consent`; búsquedas por cita con alcance por centro.
- [x] **Web:** pantalla de confirmación masiva (filtros, selección que se limpia al cambiar de filtro, diálogo de confirmación con el texto exacto, seguimiento del avance, simulación de respuestas solo en demo, horas por liberar) y edición de los **parámetros de envío** por el administrador (cada cambio queda auditado).

**Decisiones tomadas en S3**
- **El estado de la agenda es de AVIS.** Un «No» no cancela la cita en este sistema: deja una tarea para que una persona libere la hora en AVIS y la marque aquí. La cita sigue `booked` en FHIR.
- **Sin teléfono o con baja = directo a «Pendientes por llamar»**, sin pasar por WhatsApp.
- **Entrega «al menos una vez»:** si WhatsApp acepta el mensaje y el proceso cae antes de guardarlo, un reintento podría duplicarlo (la Cloud API no tiene clave de idempotencia). Una respuesta `200` sin id de mensaje se trata como error permanente para no arriesgar duplicados.
- **No se guarda el texto de los pacientes:** solo el resultado de interpretarlo.
- **La simulación de respuestas** usa el mismo código del webhook real (no un atajo), con un reparto determinista; solo existe con `WHATSAPP_MODO=simulador` fuera de producción.

**Pendiente a futuro de S3:** cambiar el horario no reprograma lo que ya está en la cola (se aplica a los próximos envíos); confirmación de baja al paciente («no le escribiremos más») no se envía; reintento manual de mensajes fallidos desde la interfaz; la base legal para escribir por WhatsApp (consentimiento previo vs. interés legítimo en salud) debe definirla la Dirección de Salud (§7).

### S4 — Pendientes y llamadas
**Estado: completado y verificado de punta a punta** en el navegador (cola → panel de llamada → registro → llamada entrante → historial) contra Keycloak y Postgres reales. **370 pruebas** en total, 111 de integración contra PostgreSQL.

- [x] **Cola de pendientes:** citas futuras en «Sin respuesta» o «Enviado» con la espera vencida (el barrido aún no las movió, y se muestran ya como «Sin respuesta»). **Adultos mayores primero** (RN-05), luego fecha y hora. Una cita con recado o «no ubicado» **sigue en la cola** con su número de intentos y el último resultado: nunca se cancela por no contestar (RN-01, verificado también en FHIR: `Appointment.status` sigue `booked`).
- [x] **Registro del resultado:** Confirmado / Recado dejado / No ubicado / Cancelado. Cada intento queda guardado (cita, resultado, quién, cuándo, observación) y los estados finales guardan la forma de contacto «llamada». **Recado y No ubicado se distinguen** (corrige el hallazgo 6.10 del informe). «Cancelado» crea la tarea «liberar hora en AVIS». La transición es condicional: si dos funcionarias registran a la vez, una gana y la otra recibe 409 (probado en paralelo).
- [x] **Panel de llamada:** contactos anteriores (WhatsApp y llamadas, con quién las hizo), los 4 resultados con atajos de teclado `1`–`4` y la advertencia «no escribas datos clínicos». Al registrar pasa solo a la siguiente paciente.
- [x] **Revelación auditada:** el teléfono (o el RUT) completo solo se obtiene al pulsar «Mostrar», se oculta solo a los 30 s y se puede copiar. Cada revelación queda en la bitácora (`dato.revelar`: quién, cuándo y qué campo; nunca el valor).
- [x] **Llamada entrante:** búsqueda por RUT entre los pacientes **con citas en ese centro** (uno que solo tiene citas en otro centro se trata como no encontrado); se registra aunque el paciente no esté cargado (queda solo con el RUT); motivo, con detalle obligatorio para «Otros»; observación; el servidor mide el tiempo del registro (**9 s** en la prueba real; meta < 30 s). Foco en el RUT, `Enter` busca, `Ctrl+Enter` registra.
- [x] **Historial paginado en el servidor:** filtros por fechas (con los límites del día en **hora de Chile**, probados en 00:00:00 y 23:59:59), motivo, centro y búsqueda por RUT exacto o nombre. La funcionaria ve solo su centro; el encargado y el administrador, todos o uno.
- [x] **FHIR:** `Communication` de llamadas (entrantes y salientes, medio «teléfono», sin observaciones) y búsqueda `Communication?patient=` que reúne WhatsApp y llamadas con alcance por centro y lectura auditada.

**Decisiones tomadas en S4**
- **La observación es texto libre y puede traer datos personales**, así que no se copia a la auditoría ni a FHIR; la interfaz advierte «sin datos clínicos» y está limitada a 500 caracteres.
- **Registrar llamada sobre «Enviado» o «Sin enviar» está permitido** (la funcionaria puede llamar sin esperar el WhatsApp).
- **El nombre de quien registró** sale de la tabla de usuarios, que se alimenta al ingresar al sistema.

**Pendiente a futuro de S4:** exportar el historial a Excel (va con los reportes, S5); límite de intentos por cita o recordatorio de «volver a llamar a las…»; mostrar a la funcionaria cuántos pendientes tiene en el menú.

### S5 — Dashboard, reportes y configuración
- [ ] Endpoints de agregación (vistas materializadas o consultas indexadas) por centro/período, zona America/Santiago.
- [ ] Dashboard con 7 KPI incluyendo "Enviadas" (D-03), reportes con filtros y exportación Excel auditada.
- [ ] Configuración persistente: plantillas, motivos, parámetros, asignación de centro a usuarios.
- [ ] "Restablecer datos demo" solo en ambiente DEMO (RF-21).
- [ ] Métricas de piloto (14.1): tasa de respuesta, llamadas evitadas, tiempo por registro.

### S6 — Endurecimiento, conformidad y piloto
- [ ] Fachada FHIR completa: `GET/POST` según CapabilityStatement, búsquedas mínimas (`Patient?identifier=`, `Appointment?date=&location=`), `_format=json`; todo ejemplo y respuesta validados con el Validator en CI.
- [ ] Seguridad: CSP, HSTS, X-Frame-Options/`frame-ancestors` (permitir solo origen AVIS si se embebe), rate limiting, cifrado en reposo (disco + columnas sensibles con pgcrypto), backups cifrados con prueba de restauración, rotación de secretos.
- [ ] Privacidad (Ley 21.719): registro de actividades de tratamiento, política de retención (p. ej. citas/contactos 12 meses → anonimización), procedimiento ARCO+ (acceso, rectificación, supresión, oposición, portabilidad, bloqueo), plan de notificación de brechas.
- [ ] Pruebas: E2E Playwright de flujos A y B, `@axe-core/playwright` sin errores, prueba de carga de envío masivo (1.000 citas), pentest básico OWASP ASVS nivel 2.
- [ ] Despliegue en región Chile, ambientes DEMO y QA, manual de operación, guía de pruebas del cap. 12 actualizada.

## 4. Modelo de datos (resumen)

`centro` · `profesional` · `usuario` · `paciente` (RUN único, teléfono cifrado) · `cita` (FK paciente, centro, profesional; `tipo`; `appointment_status`) · `tarea_contacto` (estado de contactabilidad, 1:1 con cita) · `mensaje` (envíos y estados WhatsApp) · `contacto_llamada` (saliente: resultado, usuario) · `llamada_entrante` (FK motivo, paciente opcional, RUT) · `motivo_llamada` · `plantilla_mensaje` · `consentimiento` · `carga` (metadatos, sin archivo) · `audit_event`. Cada entidad con interoperabilidad guarda `fhir_id` y `fhir_version`. Mapeo completo en ADR-001 §2.4.

## 5. Definición de terminado (DoD)

- Código revisado por 1 integrante, CI verde (tipos, lint, tests ≥ 70 % en `api` y `shared`).
- Pantallas cumplen el checklist de la skill `diseno-clinico-avis` (§9).
- Recursos FHIR nuevos con ejemplo en `packages/fhir/examples` validado.
- Acciones sobre datos de pacientes generan `AuditEvent`.
- Sin datos reales en el repositorio ni en logs (logs con RUT enmascarado).

## 6. Riesgos

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Formato de exportación AVIS distinto al supuesto | Alta | Alto | Levantamiento en S0–S2; parser configurable por mapeo de columnas |
| Aprobación de plantilla WhatsApp/verificación de negocio Meta tarda | Media | Alto | Iniciar trámite en S1; simulador como respaldo para H2 |
| Guías FHIR chilenas cambian (ballot / CI build) | Media | Medio | Versión fijada; revisión por hito; mapeadores aislados en `packages/fhir` |
| Sin convenio de tratamiento de datos para piloto real | Media | Alto | Piloto con ficticios; convenio con Dirección de Salud en paralelo (13.3) |
| Postergación Ley 21.719 | Media | Bajo | Diseñar ya con sus exigencias |
| Costos de mensajes WhatsApp | Baja | Medio | Parámetro de presupuesto mensual y alerta |

## 7. Decisiones pendientes con el cliente (Cesfam / Dirección de Salud)

1. Columnas y formato reales de la exportación de agenda AVIS; ¿AVIS ofrece API FHIR o HL7 v2?
2. Anticipación del envío (¿24 h, 48 h, 1 mes?) y horario permitido.
3. Texto de la plantilla y nombre visible del remitente (¿un número por comuna o por Cesfam?).
4. Responsable del tratamiento, encargado y alojamiento (convenio).
5. Si una respuesta "No" debe liberar la hora automáticamente en el futuro (requiere integración AVIS).
6. Puestos de trabajo: resolución, monitores, navegador (para calibrar la skill — `avis-referencia.md`).
7. ¿La exportación de AVIS trae **edad o fecha de nacimiento** y **sexo**? (el lector ya acepta ambas como columnas opcionales; la prioridad de adultos mayores en S4 depende de esto).
8. **Código DEIS** de cada Cesfam (CL Core identifica establecimientos por DEIS; hoy se usa un código local).
9. **WhatsApp:** ¿un número por comuna o por Cesfam? Nombre visible del remitente, titular de la cuenta de Meta Business y quién tramita la verificación del negocio y la aprobación de las plantillas (bloqueante para el piloto).
10. **Texto de reagendamiento:** ¿qué canales debe mencionar el mensaje cuando el paciente responde «No» (p. ej. Hora Fácil, Mi CHC, teléfono del Cesfam)? Hoy es un texto genérico editable en Configuración.
11. **Base legal para escribir por WhatsApp** (Ley 21.719): consentimiento previo del paciente o interés legítimo en salud; definir con la Dirección de Salud antes de usar datos reales.

## 8. Próximo paso inmediato

Aprobar ADR-001 y comenzar S0 en `feat/mvp` (scaffolding del monorepo y CI).
