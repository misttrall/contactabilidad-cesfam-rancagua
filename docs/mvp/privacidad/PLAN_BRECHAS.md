# Plan de respuesta a brechas de seguridad de datos personales

> Borrador técnico. Los plazos de notificación a la autoridad y a los titulares deben confirmarse con asesoría legal: la ley exige notificar a la Agencia de Protección de Datos Personales **por los medios más expeditos y sin dilaciones indebidas** cuando la brecha afecta datos sensibles (como los de salud) o implica riesgo para los titulares.

## 1. Qué es una brecha

Pérdida, acceso, alteración, divulgación o destrucción no autorizados de datos personales. Ejemplos aquí: envío de una planilla o de un Excel a la persona equivocada, una cuenta de funcionaria comprometida, un respaldo o una clave filtrados, un mensaje de WhatsApp al paciente equivocado, un acceso a pacientes de otro centro.

## 2. Roles

| Rol | Responsabilidad |
|---|---|
| Quien detecta (cualquiera) | avisar **de inmediato** al responsable de seguridad; no borrar evidencia |
| Responsable de seguridad **(DECIDIR)** | coordina, decide la severidad, activa el plan |
| Administrador del sistema | contiene técnicamente (§4) |
| Responsable del tratamiento (Dirección de Salud) **(DECIDIR)** | decide notificar a la autoridad y a los titulares |
| Asesoría legal | revisa el contenido y los plazos |

## 3. Línea de tiempo (objetivo)

| Cuándo | Qué |
|---|---|
| T+0 | detección y aviso al responsable de seguridad |
| ≤ 1 h | contención (§4) y apertura del registro del incidente |
| ≤ 24 h | evaluación de alcance y severidad (§5); decisión de notificar |
| sin dilaciones indebidas | notificación a la Agencia y, si corresponde, a los titulares (§6) |
| ≤ 30 días | informe posmortem y acciones correctivas |

## 4. Contención técnica (administrador)

1. **Cuenta comprometida:** desactivarla en Configuración → Usuarios (el bloqueo rige en ≤ 30 s aunque el token siga vigente) y cerrar sus sesiones en Keycloak; forzar cambio de contraseña/MFA.
2. **Clave o secreto filtrado:** rotar según [OPERACION.md §4](../OPERACION.md) (`DATA_ENCRYPTION_KEY`, `KC_ADMIN_SECRET`, tokens de WhatsApp, claves de respaldo).
3. **Envío por WhatsApp erróneo:** detener la cola (poner `WHATSAPP_MODO=simulador` y reiniciar la API, o desactivar el envío en Configuración → Parámetros) y revisar `envio.crear`.
4. **Exposición de la API:** bloquear el origen en el balanceador; los límites de tasa ya frenan la extracción masiva (revelar 60/min por IP).
5. **Preservar evidencia:** respaldo de la base y de los logs **antes** de cualquier cambio; la bitácora de auditoría es inmutable (no se puede borrar ni editar).

## 5. Evaluación

Usar la bitácora (`audit_event`) para acotar **quién**, **qué** y **cuándo**: `dato.revelar`, `paciente.leer`, `paciente.buscar`, `reporte.exportar`, `privacidad.acceso`, `sesion.ingreso`, `acceso.denegado`. Determinar: categorías de datos (¿salud?), número de titulares, si el teléfono/RUT estuvo en claro, si los datos estaban cifrados, y el riesgo para los titulares.

| Severidad | Criterio | Acción |
|---|---|---|
| Baja | sin datos personales o ya cifrados/anonimizados, sin acceso real | registrar; sin notificación |
| Media | datos de contacto de pocos titulares, contenida | registrar; el responsable decide |
| **Alta** | datos de salud, muchos titulares o acceso malicioso | **notificar** (§6) |

## 6. Notificación

**A la Agencia de Protección de Datos Personales** (por el responsable del tratamiento): naturaleza de la brecha, categorías y n.º aproximado de titulares y registros, medidas adoptadas, contacto, consecuencias probables.

**A los titulares** cuando haya riesgo para sus derechos o se trate de datos sensibles: lenguaje claro, qué pasó, qué datos, qué se hizo, qué pueden hacer (p. ej. desconfiar de mensajes inesperados), y a quién contactar. Los mensajes oficiales **nunca** piden claves ni datos bancarios.

## 7. Registro del incidente

Folio · fecha/hora de detección · quién lo detectó · descripción · datos y titulares afectados · contención · notificaciones realizadas (fecha, destinatario) · causa raíz · acciones correctivas y responsables. Se conserva con el resto de la documentación de privacidad.

## 8. Prevención y simulacro

Revisar este plan y hacer un **simulacro** (p. ej. «cuenta de funcionaria comprometida») antes del piloto y cada 6 meses; registrar el tiempo de contención logrado.
