# Procedimiento de derechos del titular (ARCO+)

> Borrador técnico para el responsable del tratamiento. Plazos y formalidades: confirmar con asesoría legal (la ley fija un plazo de respuesta de **30 días corridos**, prorrogable en casos justificados).

Derechos: **A**cceso, **R**ectificación, **S**upresión (cancelación), **O**posición, además de **portabilidad** y **bloqueo**.

## Quién atiende

Solo el rol **administrador** (módulo Configuración) ejecuta estas acciones; todas quedan en la bitácora (`privacidad.*`) con su identificador, sin RUT ni nombre. La solicitud entra por el canal oficial del Cesfam (presencial, correo o formulario) y la registra el responsable de privacidad en su sistema de solicitudes (folio propio).

## Pasos comunes

1. **Registrar** la solicitud: fecha, derecho solicitado, folio.
2. **Verificar la identidad** del titular (cédula de identidad o equivalente; si actúa un representante, poder). **No pedir más datos de los necesarios.** No se verifica por WhatsApp.
3. **Ubicar al paciente** en el sistema: buscar por RUT (módulo Pendientes / Llamadas) y obtener su `id` interno. *(Pendiente de mejora: pantalla en Configuración; hoy se opera por API.)*
4. Ejecutar la acción de la tabla y **responder dentro del plazo**, aunque la respuesta sea una negativa fundada.
5. Cerrar la solicitud con el folio y la fecha.

## Por derecho

| Derecho | Qué se hace | API (administrador) |
|---|---|---|
| **Acceso / Portabilidad** | Entregar al titular una copia de sus datos en JSON (paciente, citas, mensajes, llamadas, consentimientos) | `GET /api/config/privacidad/pacientes/{id}/datos` → evento `privacidad.acceso`. Entregar por un medio seguro y a la persona verificada. |
| **Rectificación** | La fuente de verdad de nombre, teléfono y citas es **AVIS**: la corrección se hace **allí** y llega en la próxima carga de la planilla (el sistema actualiza el paciente por RUT). Para un teléfono erróneo urgente, la funcionaria puede corregirlo en la próxima carga o pedir al admin la oposición mientras tanto. | — |
| **Supresión** | Anonimiza de forma irreversible al paciente (también sexo y fecha de nacimiento) y lo da de baja del WhatsApp. Las citas y estadísticas se conservan sin identificar. **No** borra datos de AVIS (otro responsable): informar al titular. Puede denegarse si existe obligación legal de conservar (la ficha clínica es de AVIS/Cesfam). | `POST /api/config/privacidad/pacientes/{id}/suprimir` con `{"motivo":"Solicitud ARCO folio N","confirmacion":"SUPRIMIR"}` → evento `privacidad.suprimir` |
| **Oposición / Bloqueo** | El paciente no vuelve a recibir mensajes por WhatsApp (se le contactará solo por teléfono si procede) y queda constancia (`consentimiento`: revocado, origen `arco`). No borra nada. | `POST /api/config/privacidad/pacientes/{id}/oposicion` → evento `privacidad.oposicion` |

El paciente también puede **darse de baja directamente** respondiendo «BAJA» al WhatsApp; eso queda registrado igual.

## Restauraciones y consistencia

Si se restaura un respaldo, **repetir** las supresiones posteriores a su fecha (buscar `privacidad.suprimir` en `audit_event` y volver a ejecutarlas por `recurso_id`). Ver [POLITICA_RETENCION.md](POLITICA_RETENCION.md).

## Indicadores

Registrar mensualmente: solicitudes recibidas por derecho, tiempo medio de respuesta, rechazos y su motivo.
