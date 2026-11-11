# Política de retención y anonimización

> Borrador técnico. Plazo propuesto: **12 meses**; ajustable con `RETENCION_MESES` (1–120). Confirmar con el responsable del tratamiento.

## Regla

Un paciente se **anonimiza** cuando **no tiene ninguna cita con fecha dentro de los últimos `RETENCION_MESES` meses** (y fue registrado antes de ese corte). Las llamadas entrantes sin paciente identificado (solo el RUT) anteriores al corte también se anonimizan.

## Qué significa «anonimizar»

| Se conserva (estadísticas) | Se elimina o generaliza |
|---|---|
| citas, estados de contacto, mensajes (solo estado), llamadas y sus motivos, bajas de WhatsApp | nombre → «Paciente anonimizado» |
| sexo y **año** de nacimiento (para tramos de edad de los reportes) | RUT → `ANON-<id>` (también en las llamadas entrantes) |
| | teléfono cifrado y su huella de búsqueda |
| | fecha de nacimiento exacta → 1 de enero del año |
| | observaciones libres de llamadas y «otro motivo» |

El paciente anonimizado queda con `whatsappBaja` activo: no puede recibir mensajes. Es **irreversible** y está cubierto por pruebas automáticas (`privacidad.integracion.test.ts`).

En una **supresión pedida por el titular** (ver ARCO) se borra además el sexo y la fecha de nacimiento.

## Ejecución

- **Mensual**, por el administrador: `POST /api/config/privacidad/retencion` con `{"simular": true}` para ver cuántos registros caen, y luego `{"simular": false, "confirmacion": "ANONIMIZAR"}`. `GET /api/config/privacidad` muestra el corte y los pendientes.
- Cada ejecución real queda en la bitácora (`privacidad.retencion`) con cifras, sin datos personales.
- Es idempotente: repetirla no cambia nada.

## Otros datos con plazo

| Dato | Plazo | Cómo |
|---|---|---|
| Respaldos cifrados | 30 días en línea + 12 meses mensuales (propuesto) | rotación del almacén; un respaldo antiguo puede contener datos ya anonimizados en producción: **restaurarlo no los «des-anonimiza» en la base viva** salvo que se reemplace la base completa (en ese caso, volver a aplicar la retención y las supresiones registradas en la bitácora) |
| Bitácora de auditoría | ≥ 24 meses | sin datos personales directos; inmutable |
| Planillas cargadas | no se guardan | se procesan en memoria; solo metadatos de la carga |
| Logs de aplicación | 90 días | sin RUT, teléfono ni nombre |

## Importante tras restaurar un respaldo

Rehacer las **supresiones** atendidas después de la fecha del respaldo: buscar en la bitácora los eventos `privacidad.suprimir` posteriores y repetirlos. Está descrito en [PROCEDIMIENTO_ARCO.md](PROCEDIMIENTO_ARCO.md).
