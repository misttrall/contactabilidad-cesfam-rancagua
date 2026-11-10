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
pnpm turbo run typecheck test build   # lo mismo que ejecuta el CI
pnpm --filter @bh/web dev             # web en http://localhost:5173
pnpm --filter @bh/api dev             # API en http://localhost:3000 (GET /health, /fhir/R4/metadata)
pnpm infra:up                         # Postgres, Redis, Keycloak, Mailpit (solo desarrollo)
```

Copiar `.env.example` a `.env` para configurar ambiente y URLs.

## Reglas del repositorio

- **Nunca** versionar planillas reales de AVIS ni datos de pacientes (`.xlsx/.xls/.csv` bloqueados por `.gitignore` y CI). Usar solo los datos ficticios de `packages/shared/src/semillas.ts`.
- «Sin respuesta» nunca cancela una cita (RN-01): cubierto por pruebas en `@bh/shared` y `@bh/fhir`.
- Toda pantalla nueva sigue la skill `diseno-clinico-avis` (tokens, estados con ícono + texto, RUT/teléfono enmascarados).
