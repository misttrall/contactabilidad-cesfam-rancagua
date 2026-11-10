# ADR-001 — Stack tecnológico e interoperabilidad HL7 FHIR del MVP

| Campo | Valor |
|---|---|
| Estado | Propuesto (pendiente de aprobación del equipo) |
| Fecha | 10-11-2026 |
| Rama | `feat/mvp` |
| Reemplaza | Sección 5.1 "Pila tecnológica" del Informe Técnico v1.0 (prototipo) |

## 1. Contexto

- El código de `master` es un **prototipo referencial** (SPA React sin backend, datos simulados). No se reutiliza como base: el MVP se construye desde cero en `feat/mvp`, reutilizando solo el conocimiento de dominio (entidades, estados, reglas RN-01 a RN-13, requisitos RF/RNF).
- El sistema trata **datos sensibles de salud** (Ley 19.628, Ley 20.584, Ley 21.719 con vigencia fijada al 01-12-2026 salvo postergación).
- Debe operar **acoplado a AVIS** (registro clínico/agenda de APS que usan los Cesfam). En el MVP la agenda entra por exportación Excel, pero el modelo debe quedar listo para integrarse por estándar.
- Requisito nuevo (no incluido en el informe): **cumplir HL7**. En Chile, el estándar de referencia es **HL7 FHIR R4** con las guías nacionales:
  - **CL Core** (HL7 Chile, `hl7.fhir.cl.clcore`) — perfiles base: paciente, prestador, organización, ubicación, encuentro.
  - **Guía de gestión de citas médicas enfocada en la APS** (Unidad de Interoperabilidad MINSAL, `Minsal-CL/agenda`) — perfil `Cita` (Appointment) y su respuesta (AppointmentResponse).
  - Ambas están en build continuo / ballot: se **fija la versión del paquete** en el repositorio y se revisa en cada hito.

## 2. Decisión

### 2.1 Arquitectura

Monorepo TypeScript de punta a punta (un solo lenguaje para un equipo pequeño, tipos compartidos entre frontend, backend y mapeos FHIR).

```
apps/
  web/        SPA React (operación call center, embebible junto a AVIS)
  api/        API NestJS: dominio + fachada FHIR R4 + workers
packages/
  fhir/       Perfiles fijados, mapeadores dominio↔FHIR, CodeSystems locales, ejemplos
  shared/     Esquemas Zod (DTOs), validación RUT, reglas de negocio puras
  ui/         Design system clínico (tokens + componentes) según la skill diseno-clinico-avis
infra/        docker-compose, nginx, Keycloak realm, scripts de validación FHIR
```

### 2.2 Stack

| Capa | Elección | Por qué (frente a la alternativa) |
|---|---|---|
| Frontend | **React 19 + Vite 6 + TypeScript 5** | Equipo ya conoce React; SPA interna detrás de login, sin necesidad de SSR/SEO (se descarta Next.js). Se sirve estático desde nginx y puede abrirse embebida o en ventana lateral a AVIS. |
| Ruteo y datos | **TanStack Router + TanStack Query** | Rutas tipadas, caché y reintentos de red; elimina el defecto D-02 (estado aislado por pantalla). |
| Tablas | **TanStack Table** (virtualizada) | Listas de cientos de citas con filtros, orden y selección masiva. |
| Formularios | **React Hook Form + Zod** (esquemas de `packages/shared`) | Misma validación (RUT módulo 11, teléfono +569) en cliente y servidor. |
| UI | **Radix UI (primitivas accesibles) + Tailwind CSS v4** con tokens propios | Accesibilidad WCAG 2.2 AA de base y estética definida por nosotros (no "look" de librería genérica). |
| Gráficos | Recharts | Ya validado con el cliente en el prototipo. |
| Backend | **NestJS 11 sobre Node.js 22 LTS** | Modular, inyección de dependencias, guards para rol/centro, OpenAPI automático. |
| Base de datos | **PostgreSQL 16** + **Prisma** | Modelo relacional normalizado (corrige la desnormalización del cap. 6.10) y columna `jsonb` para el recurso FHIR emitido. |
| Colas | **BullMQ + Redis 7** | Envíos masivos WhatsApp con reintentos, límite de tasa y segundo mensaje programado. |
| Identidad | **Keycloak 26 (OIDC)** | Roles (funcionaria/encargado/administrador) + atributo `centro`; MFA; federación futura con SSO institucional/SMART on FHIR. |
| Interop. | **Fachada FHIR R4** propia en `/fhir/R4` + **HL7 FHIR Validator** (CLI oficial) en CI | Ver 2.3. |
| Excel | **SheetJS 0.20.x desde cdn.sheetjs.com** (no el 0.18.5 de npm, con CVE-2023-30533 / CVE-2024-22363), procesado en servidor | Corrige D-15; el archivo nunca se guarda en disco ni en git. |
| WhatsApp | **WhatsApp Business Platform (Cloud API)** tras un *adapter* con modo `simulador` | Plantillas aprobadas con botones Sí/No, webhooks de estado y respuesta. |
| Pruebas | Vitest, Testing Library, Playwright, Testcontainers (Postgres) | Cubre el pendiente de pruebas automatizadas del informe. |
| Entrega | Docker Compose (dev/demo), GitHub Actions (lint, tipos, tests, validación FHIR, build de imágenes) | Corrige D-01 (build roto) con un gate obligatorio. |

### 2.3 Estrategia HL7: dominio relacional + fachada FHIR

Se evaluaron tres opciones:

| Opción | Ventaja | Desventaja | Decisión |
|---|---|---|---|
| A. Servidor FHIR completo (HAPI FHIR JPA, Java) como base de datos | Conformidad FHIR total "de fábrica" | Segundo lenguaje, lógica de negocio dispersa, operación más pesada | Descartada para MVP; opción para fase de integración regional |
| B. Plataforma FHIR (Medplum) | Rápido, trae auth y auditoría | Acopla el producto a un tercero, curva de aprendizaje, menos control del flujo de contactabilidad | Descartada |
| **C. Dominio propio en Postgres + fachada FHIR R4 con perfiles CL Core/MINSAL** | Reglas de negocio simples de mantener, un solo lenguaje, FHIR donde hay intercambio | Debemos validar conformidad nosotros | **Elegida** |

Reglas de la fachada:
1. Todo recurso expuesto o recibido se **valida contra el perfil** fijado (`packages/fhir/ig/`) en CI y, en tiempo de ejecución, con validación estructural Zod generada desde los perfiles.
2. `CapabilityStatement` publicado en `/fhir/R4/metadata`.
3. La carga Excel de AVIS se convierte internamente en un **`Bundle` transaction** FHIR; así, cuando AVIS (u otro sistema) entregue FHIR o HL7 v2, solo cambia el adaptador de entrada.
4. Adaptador **HL7 v2 (SIU^S12/S14/S15, ADT^A08)** queda diseñado como interfaz, no implementado en el MVP.

### 2.4 Mapeo del dominio a FHIR R4

| Dominio (prototipo) | Recurso FHIR | Perfil / notas |
|---|---|---|
| Centro (Cesfam) | `Organization` + `Location` | CL Core (organización / ubicación) |
| Paciente | `Patient` | CL Core paciente; identificador RUN con sistema y tipo definidos por CL Core; sexo → `gender` |
| Profesional | `Practitioner` / `PractitionerRole` | CL Core prestador |
| Cita | `Appointment` | Perfil **Cita** de la guía MINSAL Agenda APS. `status` usa `AppointmentStatus` (binding requerido) |
| Respuesta Sí/No del paciente | `AppointmentResponse` | `participantStatus`: `accepted` (Sí) / `declined` (No) |
| Estado de contactabilidad (sin_enviar, enviado, sin_respuesta…) | `Task` (flujo de contacto) | Es un estado **de nuestro proceso**, no de la agenda: no se fuerza en `Appointment.status` |
| Envío WhatsApp | `CommunicationRequest` → `Communication` | `medium` = WhatsApp; `payload` sin datos clínicos |
| Llamada saliente (Confirmado/Recado/No ubicado/Cancelado) | `Communication` + `Task.output` | CodeSystem local `resultado-llamada` (conserva Recado vs No ubicado, corrige 6.10) |
| Llamada entrante | `Communication` (emisor = paciente) | `reasonCode` desde CodeSystem local `motivo-llamada` (SOL_HORA, …, OTROS) |
| Tipo crónico/morbilidad | `Appointment.serviceType` / `appointmentType` | CodeSystem local mapeado al catálogo que use AVIS |
| Consentimiento canal WhatsApp | `Consent` | Requisito 13.3 del informe |
| Auditoría de accesos y cambios | `AuditEvent` + `Provenance` | Tabla *append-only*; requisito Ley 21.719 |

Mapeo de estados (regla RN-01 "Sin respuesta nunca cancela"):

| Estado UI | `Task.status` / `businessStatus` | `Appointment.status` | `AppointmentResponse` |
|---|---|---|---|
| Sin enviar | `ready` / `sin-enviar` | `booked` | — |
| Enviado | `in-progress` / `enviado` | `booked` | — |
| Confirmado | `completed` / `confirmado` | `booked` | `accepted` |
| Sin respuesta | `in-progress` / `sin-respuesta` | **`booked` (nunca `cancelled`)** | — |
| Cancelado por paciente | `completed` / `cancelado` | `booked` hasta que AVIS libere la hora* | `declined` |

\* Nuestro sistema **no es dueño de la agenda**: un "No" genera una tarea de liberación de hora para que la funcionaria la anule en AVIS (o, en fase de integración, se envía la cancelación a AVIS). Esto evita estados divergentes entre ambos sistemas.

## 3. Consecuencias

- (+) Interoperable desde el día 1; integración futura con AVIS, Hospital Digital o el Servicio de Salud O'Higgins sin rehacer el modelo.
- (+) Corrige los defectos D-01, D-02, D-08, D-10, D-14 y D-15 por diseño.
- (−) Debemos mantener mapeadores y validar perfiles en CI; las guías chilenas están en evolución → se fija versión y se revisa por hito.
- (−) Keycloak y Redis suman servicios a operar; se aceptan por seguridad y confiabilidad de envíos.

## 4. Texto sugerido para actualizar el Informe Técnico

- **5.1 Pila tecnológica:** reemplazar por la tabla 2.2.
- **5.3 / 5.7 Arquitectura y despliegue:** cliente SPA → API NestJS → PostgreSQL/Redis; Keycloak; worker de envíos; fachada FHIR `/fhir/R4`; contenedores Docker; alojamiento en región Chile.
- **Nuevo capítulo "Interoperabilidad HL7 FHIR":** secciones 2.3 y 2.4 de este ADR.
- **3.5 Fuera de alcance:** se mantiene fuera la telefonía integrada y la escritura directa en AVIS; **entra** backend, base de datos, autenticación y WhatsApp (modo simulador + Cloud API de prueba).
- **6. Modelo de datos:** normalizado (Paciente y Usuario como entidades; `atendidoPor` → `usuario_id`).
