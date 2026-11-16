# Autoevaluación de seguridad — OWASP ASVS 4.0 nivel 2

> **Esto es una autoevaluación del equipo de desarrollo, con evidencia en pruebas automáticas y revisión de código. No es una prueba de penetración independiente.** Antes del piloto con datos reales debe hacerse una prueba externa (OPERACION.md §7). Estados: ✅ cumple y tiene prueba · 🟡 cumple parcialmente o depende de la infraestructura · ⬜ no aplica / pendiente.

## V1 Arquitectura
| Control | Estado | Evidencia |
|---|---|---|
| Modelo de amenazas / separación de responsabilidades | 🟡 | ADR-001; AVIS es dueño de la agenda, el sistema no escribe en AVIS. Falta un modelo de amenazas formal. |
| Roles mínimos y alcance por centro | ✅ | `resolverAlcance`, tests de 403/404 entre centros (`app.test.ts`, integración de cada módulo) |

## V2 Autenticación
| Control | Estado | Evidencia |
|---|---|---|
| Autenticación delegada a un IdP estándar (OIDC + PKCE S256) | ✅ | Keycloak; `realm.json` |
| MFA | 🟡 | Obligatorio en el realm QA/PROD generado (`generar-realm.mjs`, test); en local no. |
| Política de contraseñas y bloqueo por intentos | ✅ | `passwordPolicy` (12 car.), `bruteForceProtected` |
| Sin contraseñas ni secretos de usuario en la aplicación | ✅ | solo se guarda el id (`sub`) |

## V3 Sesiones
| Control | Estado | Evidencia |
|---|---|---|
| Tokens firmados, audiencia y emisor verificados, expiración | ✅ | tests «firmado con otra clave», «audiencia», «emisor», «expirado» |
| Cierre por inactividad (30 min) y bloqueo de usuario desactivado en ≤ 30 s | ✅ | realm; `UsuarioActivoService` y su test de integración |

## V4 Control de acceso
| Control | Estado | Evidencia |
|---|---|---|
| Autorización en el servidor en cada endpoint (deny by default) | ✅ | `AuthGuard` global; `@Publico()` solo `/health`, `/fhir/R4/metadata` y webhook |
| Aislamiento entre centros (IDOR) | ✅ | tests: una funcionaria de otro centro recibe 404 en citas, pacientes, tareas, comunicaciones |
| Funciones administrativas solo para administrador | ✅ | tests «solo el administrador entra a la configuración» y de privacidad |
| Sin autoeliminación de privilegios | ✅ | test de administración |

## V5 Validación y codificación
| Control | Estado | Evidencia |
|---|---|---|
| Validación de entrada con esquemas (zod, `.strict()`) | ✅ | todos los controladores; fechas imposibles → 400 (corregido en S5) |
| Inyección SQL | ✅ | Prisma (consultas parametrizadas); sin SQL crudo con entrada del usuario |
| Inyección de fórmulas en Excel | ✅ | `sanitizarCelda` + tests |
| Carga de archivos | 🟡 | solo `.xlsx/.xls/.csv`, tamaño acotado, procesado en memoria, no se guarda; límite de tasa 10/min. No hay antivirus. |
| XSS | ✅ | React escapa; CSP sin `unsafe-inline` en scripts (`despliegue.test.mjs`); sin `dangerouslySetInnerHTML` |

## V6 Criptografía
| Control | Estado | Evidencia |
|---|---|---|
| Cifrado de datos sensibles en reposo | ✅/🟡 | teléfono con AES-256-GCM en la aplicación (autenticado, IV aleatorio); discos y respaldos cifrados (infra, ver OPERACION.md). RUT/nombre confían en el cifrado de disco: decisión documentada, no se cifran por columna porque el RUT es la clave de búsqueda única. |
| Gestión y rotación de claves | ✅ | claves con id, `DATA_ENCRYPTION_KEY_ANTERIORES`, `rotar-claves` (tests) |
| Huella de búsqueda no invertible | ✅ | HMAC-SHA256 con clave derivada |

## V7 Errores y registro
| Control | Estado | Evidencia |
|---|---|---|
| Bitácora de auditoría inmutable, sin datos personales | ✅ | trigger append-only (migración), tests de que no se filtran RUT/nombre |
| Logs sin RUT, teléfono ni nombre | ✅ | revisión de código y tests |
| Errores sin detalles internos | ✅ | los errores no controlados responden 500 genérico (comportamiento de Nest); los de dominio usan mensajes propios sin trazas |

## V8 Protección de datos
| Control | Estado | Evidencia |
|---|---|---|
| Minimización y enmascaramiento (RUT, teléfono) con revelación auditada | ✅ | `dato.revelar`, límite 60/min |
| Sin caché de datos de pacientes | ✅ | `Cache-Control: no-store` en `/api` y `/fhir` (test) |
| Retención y anonimización | ✅ | `privacidad.integracion.test.ts` |
| Derechos ARCO+ | ✅ | acceso, oposición, supresión (API + tests) |
| Mensajes a pacientes sin nombre, profesional ni prestación | ✅ | plantillas; tests de `mensajes` |

## V9 Comunicaciones
| Control | Estado | Evidencia |
|---|---|---|
| TLS y HSTS | 🟡 | HSTS enviado fuera de DEMO (test); TLS lo termina el proxy (infra) |
| `KEYCLOAK_ISSUER` https en producción | ✅ | validación de configuración |

## V10 Código malicioso y V12 Archivos
| Control | Estado | Evidencia |
|---|---|---|
| Dependencias | 🟡 | `pnpm-lock` congelado en CI; **Dependabot** semanal y `pnpm audit` en CI (bloquea críticas en producción; el resto informa). Al 2026-11-16 quedan 2 avisos *high* en producción: `zod` 3.x (consumo de memoria con colecciones enormes: mitigado por el límite de 100 kB del cuerpo de Express; la corrección exige migrar a zod 4) y `deepmerge-ts` dentro del CLI de Prisma (solo en migraciones). Resto: herramientas de desarrollo (vitest, eslint, esbuild). |
| Archivos subidos no se ejecutan ni se almacenan | ✅ | solo memoria |

## V13 API
| Control | Estado | Evidencia |
|---|---|---|
| Límite de tasa por usuario (y por IP solo contra inundación) | ✅ | `seguridad.test.ts` (dos usuarias con la misma IP no comparten cupo), ráfaga en `carga-envio.integracion.test.ts` |
| CORS restringido a los orígenes de la web | ✅ | `WEB_ORIGINS` |
| Webhook con firma HMAC (`X-Hub-Signature-256`) y comparación en tiempo constante | ✅ | `mensajeria.integracion.test.ts` |
| Formato FHIR validado | ✅ | `_format` no soportado → 406 `OperationOutcome`; validador oficial en CI |

## V14 Configuración
| Control | Estado | Evidencia |
|---|---|---|
| Cabeceras: CSP, `X-Frame-Options`/`frame-ancestors`, `nosniff`, `no-referrer`, HSTS | ✅ | API (`seguridad.test.ts`) y web (`despliegue.test.mjs`) |
| Sin cliente/usuarios de desarrollo en QA/PROD | ✅ | `generar-realm.test.mjs` |
| Secretos fuera del repositorio | ✅ | `.gitignore`, validaciones de arranque |

## Riesgos conocidos y aceptados para el piloto
1. **Límite de tasa en memoria**: válido con una instancia; con más hay que pasarlo a Redis.
2. **Dependencias:** quedan 2 avisos *high* en producción (ver V10) hasta migrar a zod 4 y actualizar Prisma.
3. **Sin antivirus** para planillas (se procesan en memoria y no se guardan).
4. **Sin pentest independiente** ni modelo de amenazas formal. No conozco una norma que obligue a que sea externo, pero un tercero da más garantías ante la Dirección de Salud: ver la decisión en el plan §7.
5. Las **guías CL Core / Agenda APS** están en evolución; su validación en CI es informativa.
