# Registro de actividades de tratamiento (Ley 21.719)

> **Estado: borrador técnico para revisión jurídica.** Describe lo que el software hace hoy. Los campos marcados **(DECIDIR)** dependen del cliente (Dirección de Salud / Cesfam) y de asesoría legal. La Ley 21.719 entra en vigencia el **1 de diciembre de 2026** según su artículo primero transitorio. Hay un proyecto que la posterga (Boletín N.º 18.623-07): el Senado lo aprobó el 28-10-2026 con el 15-10-2027 como nueva fecha y seguía en segundo trámite en la Cámara al 10-11-2026 (fuente: Informe técnico v4, §13.1). Mientras no se publique, rige el 1-12-2026; confirmar su estado antes del piloto con datos reales. Se diseña ya con sus exigencias en cualquier caso.

## 1. Responsables

| Rol | Quién |
|---|---|
| Responsable del tratamiento | **(DECIDIR)** Dirección de Salud municipal / Cesfam |
| Encargado del tratamiento | **(DECIDIR)** proveedor de BusinessHub Salud (convenio de tratamiento de datos pendiente: PLAN_MVP §7.4) |
| Subencargados | Proveedor de nube (región Chile); Meta Platforms (WhatsApp Business Platform) |
| Contacto de privacidad / delegado | César, encargado del call center de los Cesfam de Rancagua (definido por el cliente el 2026-11-16) |

AVIS sigue siendo el sistema de la agenda y de la ficha: **este sistema no escribe en AVIS** y solo recibe la exportación de agenda que carga una funcionaria.

## 2. Finalidad y base de licitud

| Finalidad | Base de licitud propuesta |
|---|---|
| Confirmar asistencia a horas médicas por WhatsApp y llamada telefónica, para reducir inasistencias | **(DECIDIR)** consentimiento previo del paciente, o tratamiento necesario para la atención de salud por el establecimiento. Es el punto abierto n.º 11 del plan; **no usar datos reales hasta resolverlo.** |
| Registrar llamadas entrantes y su motivo (gestión del call center) | idem |
| Estadísticas agregadas de contactabilidad (reportes) | datos anonimizados/agregados; sin datos de pacientes en el Excel |
| Seguridad y trazabilidad (bitácora de auditoría) | interés legítimo y obligación de seguridad (art. 14 quinquies de la ley) |

Los datos **no** se usan para otros fines (no hay marketing, perfilamiento ni decisiones automatizadas con efectos jurídicos).

## 3. Categorías de datos y de titulares

**Titulares:** pacientes del Cesfam con hora médica cargada; funcionarias/os del call center (usuarios del sistema).

| Dato | Titular | Sensible* | Dónde | Protección |
|---|---|---|---|---|
| RUT, nombre | paciente | no | `paciente` | mostrado enmascarado (`12.345.***-9`); revelar queda auditado |
| Teléfono | paciente | no | `paciente.telefono_cifrado` | **AES-256-GCM** en la aplicación + huella HMAC para búsqueda; enmascarado en pantalla |
| Fecha de nacimiento, sexo | paciente | no | `paciente` | solo para priorizar ≥ 65 años y reportes por tramo |
| Fecha, hora, profesional y **prestación** de la cita | paciente | **sí (salud)** | `cita` | la prestación («control crónico…») revela condición de salud; **nunca** se envía por WhatsApp ni se exporta a Excel |
| Estado de contacto, respuesta Sí/No, resultado de llamadas, observación libre | paciente | **posible** | `tarea_contacto`, `llamada_saliente`, `llamada_entrante` | la pantalla advierte «sin datos clínicos»; se borra la observación al anonimizar |
| Estado de entrega de mensajes WhatsApp (sin contenido) | paciente | no | `mensaje` | solo códigos de estado y de error |
| Baja del canal WhatsApp | paciente | no | `paciente`, `consentimiento` | historial de bajas y oposiciones |
| Identificador de usuario, rol, centro | funcionaria/o | no | Keycloak y espejo `usuario` | MFA; sin contraseña en el sistema |
| Acciones realizadas (bitácora) | funcionaria/o y paciente (id interno) | no | `audit_event` | **append-only**; sin RUT, nombre ni teléfono |

\* «Dato sensible» en el sentido de la ley: datos relativos a la salud.

## 4. Destinatarios y transferencias

| Destinatario | Qué recibe | Observaciones |
|---|---|---|
| Meta (WhatsApp Business Platform), **un único número para todos los Cesfam de Rancagua** | teléfono y variables de la plantilla (fecha, hora, nombre del Cesfam). **Sin** nombre del paciente, profesional ni prestación (RN de diseño) | **transferencia internacional** (Meta procesa fuera de Chile): requiere cláusulas/acuerdo y mención en el aviso de privacidad **(DECIDIR)** |
| Proveedor de nube | todo el contenido cifrado en reposo (disco) | **Piloto con datos ficticios: Cloudflare** (sin datos reales). **Si hay piloto real: Google Cloud, región de Santiago (`southamerica-west1`)**, para mantener los datos en Chile; convenio de encargo con el proveedor |
| Otros | ninguno | no hay venta ni cesión a terceros |

## 5. Plazos de conservación

Ver [POLITICA_RETENCION.md](POLITICA_RETENCION.md): 12 meses desde la última cita; luego anonimización. La bitácora de auditoría se conserva **24 meses** como mínimo **(DECIDIR)** (no contiene datos personales directos).

## 6. Medidas de seguridad

Cifrado en tránsito (TLS 1.2+ y HSTS), cifrado del teléfono en la aplicación y de los discos/respaldos; control de acceso por rol y por centro (una funcionaria solo ve su Cesfam); MFA; bloqueo por intentos; sesión de 30 min de inactividad; límites de tasa; CSP y cabeceras; bitácora inmutable; respaldos cifrados con prueba de restauración; rotación de claves. Detalle y evidencia en [SEGURIDAD_ASVS.md](../SEGURIDAD_ASVS.md) y [OPERACION.md](../OPERACION.md).

## 7. Derechos del titular

Procedimiento en [PROCEDIMIENTO_ARCO.md](PROCEDIMIENTO_ARCO.md).

## 8. Evaluación de impacto

La «evaluación de impacto» es la **evaluación de impacto en protección de datos** (un análisis de riesgos del tratamiento para los titulares), no de usabilidad. Por tratarse de datos de salud a escala (≈150 contactos diarios por funcionaria), se recomienda una **evaluación de impacto en protección de datos** antes del piloto real **(DECIDIR)**. Este documento y el [plan de brechas](PLAN_BRECHAS.md) sirven de insumo.
