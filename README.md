# BusinessHub Salud — Contactabilidad CESFAM Rancagua (MVP)

Confirmación masiva de horas por WhatsApp y registro de llamadas entrantes para el call center de los Cesfam de Rancagua. Se acopla a AVIS (no lo reemplaza) y expone sus datos como **HL7 FHIR R4**.

> Rama `feat/mvp`. El prototipo referencial original está en [`legacy/prototipo`](legacy/prototipo) (y en `master`). Solo usa datos ficticios.

## Documentación

- [Plan del MVP](docs/mvp/PLAN_MVP.md) — alcance, sprints S0–S6, riesgos.
- [ADR-001 Stack e interoperabilidad HL7 FHIR](docs/mvp/ADR-001-stack-y-hl7.md).
- Skill de diseño: [`.claude/skills/diseno-clinico-avis`](.claude/skills/diseno-clinico-avis/SKILL.md).

## Estructura

```
apps/api         NestJS: dominio + fachada FHIR (/fhir/R4)
apps/web         React + Vite (interfaz del call center)
packages/shared  Reglas de negocio puras, RUT, esquemas Zod, semillas ficticias
packages/fhir    Mapeos dominio <-> FHIR R4, CapabilityStatement, ejemplos
packages/ui      Design system clínico (tokens + componentes)
```

## Requisitos

Node 20.19+ (ver `.nvmrc`), pnpm 11, Docker (para Postgres/Redis/Keycloak).

## Comandos

```bash
pnpm install
pnpm lint && pnpm format:check        # ESLint y Prettier
pnpm turbo run typecheck test build   # lo mismo que ejecuta el CI
```

## Levantar el entorno de desarrollo

```bash
docker compose up -d postgres keycloak            # BD y login (Keycloak importa el realm solo)
cp .env.example apps/api/.env                     # la API lee DATABASE_URL de aquí
pnpm --filter @bh/api db:migrate                  # crea tablas y el trigger de auditoría
pnpm --filter @bh/api db:seed                     # centros, motivos y profesionales ficticios
pnpm --filter @bh/api dev                         # API en http://localhost:3000
pnpm --filter @bh/web dev                         # web en http://localhost:5173
```

Usuarios de prueba (ficticios, solo local) en [infra/keycloak/README.md](infra/keycloak/README.md): `funcionaria.csc`, `encargado.demo`, `admin.demo`… con la contraseña de desarrollo indicada allí.

En la API: `GET /health`, `GET /fhir/R4/metadata` (públicos) y el resto con `Authorization: Bearer <token>`.

## Pruebas de integración (PostgreSQL real)

Las pruebas de importación, idempotencia y concurrencia corren contra una base aparte y se **omiten** si no defines `TEST_DATABASE_URL` (el CI las exige y falla si falta):

```bash
docker compose exec -T postgres psql -U businesshub -d postgres -c "CREATE DATABASE businesshub_test"
DATABASE_URL=postgresql://businesshub:businesshub@localhost:5432/businesshub_test pnpm --filter @bh/api db:migrate
TEST_DATABASE_URL=postgresql://businesshub:businesshub@localhost:5432/businesshub_test \
TEST_REDIS_URL=redis://localhost:6379 pnpm turbo run test
```

`TEST_REDIS_URL` activa las pruebas de la cola BullMQ contra un Redis real (reintentos, diferidos, límite de tasa, reinicio). Igual que la base de datos, el CI las exige.

## Confirmación por WhatsApp

Por defecto corre en modo `simulador` (no sale nada a internet): en **Confirmación masiva** hay un botón para simular las respuestas de los pacientes, que pasan por el mismo código que el webhook real. Para usar la cola real:

```bash
docker compose up -d redis            # y REDIS_URL=redis://localhost:6379 en apps/api/.env
```

Con `WHATSAPP_MODO=cloud` (WhatsApp Business Platform) hacen falta `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`, y registrar en Meta el webhook `POST /webhooks/whatsapp` (verificación `GET` con el token). El horario de envío, las esperas y los límites se editan en **Configuración → Parámetros de envío**.

## Cargar una planilla

En la web: **Cargar planilla AVIS** → descargar la plantilla (datos ficticios) → revisar → importar. Por API: `POST /api/cargas/validar` y `POST /api/cargas` (multipart: `archivo`, `centro`, `excluirMorbilidad`). El archivo no se guarda.

## Reglas del repositorio

- **Nunca** versionar planillas reales de AVIS ni datos de pacientes (`.xlsx/.xls/.csv` bloqueados por `.gitignore` y CI). Usar solo los datos ficticios de `packages/shared/src/semillas.ts`.
- «Sin respuesta» nunca cancela una cita (RN-01): cubierto por pruebas en `@bh/shared` y `@bh/fhir`.
- Toda pantalla nueva sigue la skill `diseno-clinico-avis` (tokens, estados con ícono + texto, RUT/teléfono enmascarados).
