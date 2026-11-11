# Guía de pruebas — sesión con funcionarias y aceptación (MVP)

Actualizada en S6. Para la sesión de pruebas con el equipo del Cesfam y para la aceptación antes del piloto. **Solo datos ficticios** en DEMO y QA. Las pruebas automáticas (E2E y accesibilidad) cubren los mismos flujos y se ejecutan en cada cambio (`pnpm --filter @bh/e2e e2e`).

## 0. Preparación (quien conduce la sesión)

1. Ambiente **DEMO** (o QA) con la franja superior «DEMO · Datos ficticios».
2. Ingresar como `admin.demo` → Configuración → **Restablecer datos demo** (escribir `RESTABLECER`). Queda un conjunto de citas ficticias por centro.
3. Revisar que la ventana de envío (Configuración → Parámetros) permita enviar a la hora de la sesión (por defecto 09:00–18:00 hora de Chile; fuera de ese horario los mensajes quedan programados).
4. Usuarios de DEMO (contraseña común de demostración que entrega quien conduce la sesión):

| Usuario | Rol | Centro |
|---|---|---|
| `funcionaria.csc` | Funcionaria | CESFAM Centro |
| `funcionaria.csn` | Funcionaria | CESFAM Norte |
| `encargado.demo` | Encargado | todos |
| `admin.demo` | Administrador | todos |

## 1. Flujo A — Confirmación masiva por WhatsApp (funcionaria)

| # | Paso | Resultado esperado |
|---|---|---|
| A1 | Ingresar como `funcionaria.csc`. | Ve solo su Cesfam; el menú no muestra Configuración. |
| A2 | **Cargar planilla AVIS** → elegir el archivo de ejemplo (plantilla descargable) → *Validar*. | Resumen: filas, citas nuevas, errores por fila; RUT y teléfono **enmascarados**; morbilidad excluida si está marcada la opción. |
| A3 | Confirmar la carga. | «Cargadas N citas»; recargar el mismo archivo **no duplica**. |
| A4 | **Confirmación masiva** → fecha de las citas (usar «fecha sugerida»). | Lista del día con estados; los adultos mayores (≥ 65) aparecen primero con su etiqueta. |
| A5 | Marcar todas → **Enviar confirmación**. | El diálogo muestra cuántos pacientes recibirán el mensaje y quiénes se omiten (sin teléfono, con baja). **No** muestra diagnósticos. |
| A6 | Confirmar el envío. | Progreso «Envío en curso» → «Envío terminado». Estados «Enviado · esperando respuesta». |
| A7 | (Demo) **Simular respuestas de pacientes**. | Algunos «Confirmado», otros «Cancelado por paciente» (aparecen en «Horas por liberar en AVIS»), otros siguen sin responder. |
| A8 | Marcar una hora como «Ya la liberé» (después de liberarla en AVIS). | Sale de la lista de pendientes de liberar. |
| A9 | **Pendientes por llamar** (tras el plazo de espera o fallos de envío). | Quienes no respondieron aparecen como **«Sin respuesta · llamar»** (ámbar), **nunca** como «Cancelado» (RN-01). |
| A10 | Llamar a uno: registrar resultado (Confirmó / Dejó recado / No ubicado / Canceló). | El historial de la cita muestra el intento; «Recado» y «No ubicado» siguen en «Sin respuesta». |

## 2. Flujo B — Llamada entrante (funcionaria)

| # | Paso | Resultado esperado |
|---|---|---|
| B1 | **Llamada entrante**. | El cursor está en el campo RUT. |
| B2 | Escribir el RUT (p. ej. `1000000-9`) y **Enter**. | Si el RUT es inválido, el mensaje dice qué revisar. Si el paciente existe: nombre, edad y próximas citas; si no: «no está cargado, se registrará solo con el RUT». |
| B3 | Elegir un motivo (botones rápidos o la lista) y **Registrar llamada** (o `Ctrl+Enter`). | Mensaje de éxito. Meta de la métrica del piloto: **menos de 30 segundos** de principio a fin. |
| B4 | **Historial de llamadas**. | La llamada aparece con el RUT enmascarado; «Revelar» muestra el dato completo y **queda auditado**. |

## 3. Dashboard y reportes (encargado/a, administrador/a)

| # | Paso | Resultado esperado |
|---|---|---|
| C1 | **Inicio** como `encargado.demo`. | 7 indicadores del día (cargadas, por enviar, enviadas, confirmadas, sin respuesta, canceladas, llamadas entrantes), por llamar y por liberar, y las próximas a confirmar. |
| C2 | Cambiar de centro y de fecha. | Las cifras cambian; la funcionaria nunca ve otro centro. |
| C3 | **Reportes** → rango de fechas → **Exportar a Excel**. | Libro con 4 hojas de **cifras agregadas, sin datos de pacientes**. |

## 4. Administración (administrador/a)

| # | Paso | Resultado esperado |
|---|---|---|
| D1 | Configuración → Centros: crear, renombrar, desactivar. | Se refleja en los selectores; un centro desactivado no recibe cargas. |
| D2 | Motivos de llamada: agregar, reordenar, desactivar. | El orden se ve en Llamada entrante. |
| D3 | Usuarios: cambiar rol/centro, desactivar a un usuario de prueba. | El usuario desactivado pierde el acceso en segundos; nadie puede quitarse su propio rol de administrador. |
| D4 | Privacidad: anonimización de datos antiguos y derechos del titular. | Por API (ver [PROCEDIMIENTO_ARCO.md](privacidad/PROCEDIMIENTO_ARCO.md)); queda en la bitácora. |

## 5. Seguridad y privacidad (todos los roles)

- Una funcionaria **no** puede abrir `/configuracion` ni ver citas de otro centro (404/403).
- Ninguna pantalla muestra RUT o teléfono completos sin pulsar «Revelar».
- Cerrar sesión y volver atrás en el navegador no deja datos visibles.
- Sin actividad por 30 minutos, la sesión se cierra.

## 6. Usabilidad y accesibilidad (observación durante la sesión)

- Trabajar con la web **al lado de AVIS** (ventana de ~640 px de ancho): todo debe ser utilizable sin desplazamiento horizontal de la página.
- Operar solo con teclado el flujo B (Tab, Enter, Ctrl+Enter).
- Preguntar: ¿qué paso fue confuso?, ¿qué falta?, ¿cuánto demoró registrar una llamada?

## 7. Criterios de aceptación para el piloto

- [ ] Flujos A y B completos sin ayuda, con datos ficticios.
- [ ] Ninguna cita cancelada por falta de respuesta (RN-01).
- [ ] Llamada entrante registrada en < 30 s (mediana).
- [ ] Pruebas automáticas en verde (CI) y prueba de restauración de respaldo reciente (OPERACION.md §3).
- [ ] Decisiones del cliente cerradas: base legal, convenio, WhatsApp/Meta (PLAN_MVP §7).
