# WhatsApp real en la demo local

Cómo pasar del simulador a **WhatsApp real** (WhatsApp Business Platform, Cloud API de Meta) para que los mensajes lleguen de verdad a los celulares del equipo. Todo lo de Meta lo haces tú en su sitio (cuentas, números y aprobaciones son de una persona); el sistema ya está listo para conectarse.

> **Solo datos ficticios.** Con el número de prueba de Meta únicamente puedes escribir a un máximo de 5 celulares que registres tú (los del equipo). No se envía nada a pacientes reales. Los pacientes de la demo son ficticios; los primeros reciben los celulares del equipo (paso 6).

## Lo que cambia respecto del simulador

| | Simulador (hoy) | WhatsApp real |
|---|---|---|
| Los mensajes | no salen de tu PC | llegan al celular |
| Las respuestas Sí / No | botón «Simular respuestas (demo)» | las toca la persona en su WhatsApp |
| Requiere | nada | cuenta de Meta, token y un **webhook público** (paso 7) |

Sin webhook, **el envío funciona igual**, pero las respuestas no vuelven al sistema. Para una demo con respuestas reales hace falta el webhook (paso 7).

## Paso a paso

### 1. App en Meta
1. Entra a **developers.facebook.com** con la cuenta de Facebook del titular (decisión pendiente: ¿quién será el titular de la cuenta de Meta Business?).
2. **Mis apps → Crear app** → tipo **Empresa (Business)** → agrega el producto **WhatsApp**.
3. Meta crea una **cuenta de WhatsApp Business de prueba** y un **número de prueba** gratuito.

### 2. Datos que necesitas copiar
En *WhatsApp → Configuración de la API* (API Setup):

| Dato | Dónde está | Variable |
|---|---|---|
| **Phone number ID** | bajo el número de prueba | `WHATSAPP_PHONE_NUMBER_ID` |
| **Token de acceso** | botón «Generar token» (dura 24 h) | `WHATSAPP_TOKEN` |
| **Secreto de la app** | Configuración de la app → Básica → «Clave secreta de la app» | `WHATSAPP_APP_SECRET` |
| **Token de verificación** | lo inventas tú (cualquier texto largo y único) | `WHATSAPP_VERIFY_TOKEN` |

El token temporal **vence a las 24 horas**: sirve para probar. Para una demo de varios días, crea un **usuario del sistema** (Business Settings → Usuarios → Usuarios del sistema) con permiso `whatsapp_business_messaging` y genera un token que no vence.

### 3. Celulares de prueba
En *API Setup → Para → Administrar lista de números de teléfono*, agrega los celulares del equipo (hasta 5). Cada uno recibe un código por WhatsApp para confirmar. Solo esos celulares pueden recibir mensajes con el número de prueba.

### 4. Crear las dos plantillas
En *WhatsApp → Plantillas de mensajes → Crear plantilla* (las plantillas son obligatorias para escribir primero a un paciente; Meta las aprueba, suele tardar minutos u horas).

**Plantilla 1 — `confirmacion_hora_v1`**

| Campo | Valor |
|---|---|
| Categoría | **Utilidad** |
| Idioma | **Español** (`es`) |
| Cuerpo | `Recordatorio de {{1}}: tiene una hora de control el {{2}} a las {{3}}. ¿Asistirá?` |
| Ejemplos | `{{1}}` = CESFAM Centro · `{{2}}` = miércoles 18 de noviembre · `{{3}}` = 09:30 |
| Pie de página | `Responda BAJA si no desea recibir más mensajes.` |
| Botones | **Respuesta rápida** ×2: `Sí, asistiré` y `No podré asistir` |

**Plantilla 2 — `recordatorio_hora_v1`**

| Campo | Valor |
|---|---|
| Categoría | **Utilidad** |
| Idioma | **Español** (`es`) |
| Cuerpo | `Le recordamos su hora de control en {{1}} el {{2}} a las {{3}}. Aún no recibimos su respuesta: ¿asistirá?` |
| Ejemplos | los mismos tres |
| Pie de página | `Responda BAJA si no desea recibir más mensajes.` |
| Botones | los mismos dos de respuesta rápida |

Reglas del sistema que **no** debes cambiar: exactamente **3 variables** en ese orden (centro, fecha, hora) y **2 botones** de respuesta rápida (el primero es «Sí», el segundo «No»). La plantilla **no** debe llevar nombre del paciente, profesional ni prestación (privacidad). Si cambias el nombre de una plantilla, ajusta `WHATSAPP_PLANTILLA_CONFIRMACION` / `WHATSAPP_PLANTILLA_RECORDATORIO`.

Los mensajes de **reagendamiento** y de **baja** no son plantillas: se envían como texto libre justo después de que el paciente responde, dentro de la ventana de 24 horas que abre su respuesta.

### 5. Configurar el sistema

Crea (o edita) el archivo **`.env`** en la raíz del proyecto (no se sube al repositorio) con:

```bash
WHATSAPP_MODO=cloud
WHATSAPP_TOKEN=<token de acceso>
WHATSAPP_PHONE_NUMBER_ID=<phone number id>
WHATSAPP_APP_SECRET=<clave secreta de la app>
WHATSAPP_VERIFY_TOKEN=<texto inventado>
# WHATSAPP_API_VERSION=v21.0        # usa la versión vigente que muestre el panel de Meta
# Celulares del equipo: los primeros pacientes ficticios los reciben (formato +569XXXXXXXX)
DEMO_TELEFONOS_PRUEBA=+56912345678,+56987654321
```

Con `WHATSAPP_MODO=cloud` son obligatorias las cuatro primeras variables (si falta alguna, la API no arranca y lo dice). Aplica el cambio reiniciando solo la API:

```bash
docker compose -f docker-compose.demo.yml up -d api
```

### 6. Probar el envío (sin webhook todavía)
1. Entra como `admin.demo` → Configuración → **Restablecer datos demo** (escribe `RESTABLECER`). Los primeros pacientes quedan con los celulares de `DEMO_TELEFONOS_PRUEBA` (empezando por «Paciente Demo 001», adulto mayor).
2. Configuración → Parámetros: asegúrate de que la **ventana horaria** incluya la hora actual (fuera de ella los mensajes quedan programados).
3. Entra como `funcionaria.csc` → Confirmación masiva → selecciona solo a «Paciente Demo 001» (y 002 si cargaste dos celulares) → **Enviar**.
4. El WhatsApp debe llegar en segundos con los dos botones. El estado pasa a «Enviado».
5. **Resguardo de la demo:** en el ambiente DEMO con WhatsApp real, el sistema **solo escribe a los celulares de `DEMO_TELEFONOS_PRUEBA`**. A cualquier otro paciente (todos ficticios, con números inventados que podrían ser de una persona real) **no se le envía nada**: queda «No llegó» con el código `DEMO_NO_PERMITIDO` y pasa a «Sin respuesta · llamar». Si la lista está vacía, no sale ningún mensaje (la API lo advierte al arrancar).

El botón «Simular respuestas de pacientes» desaparece en modo `cloud`.

### 7. Recibir las respuestas (webhook público)
Meta necesita una dirección **https pública** para avisarte de los botones tocados. Desde tu PC hay que exponer la API con un túnel (por ejemplo **ngrok**, gratis con cuenta):

```bash
ngrok http 3001
```

ngrok muestra una dirección tipo `https://xxxx.ngrok-free.app`. En Meta → *WhatsApp → Configuración → Webhook*:

- **URL de devolución de llamada:** `https://xxxx.ngrok-free.app/webhooks/whatsapp`
- **Token de verificación:** el mismo `WHATSAPP_VERIFY_TOKEN`.
- **Verificar y guardar** y luego **suscribirse al campo `messages`**.

Ahora, al tocar «Sí, asistiré» en el celular, la cita pasa a **Confirmado**; con «No podré asistir» pasa a **Cancelado por paciente**, aparece «Horas por liberar en AVIS» y el paciente recibe el texto de reagendamiento con el teléfono de su Cesfam; si responde `BAJA` se registra la baja.

Seguridad: el webhook rechaza cualquier llamada sin la firma de Meta (`WHATSAPP_APP_SECRET`). Mientras el túnel está abierto, tu API es accesible desde internet (el resto de las rutas exige login y tiene límites de uso): **ciérralo al terminar la demo**. Si cambias de túnel/dirección, actualiza el webhook en Meta.

## Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La API no arranca tras poner `cloud` | falta alguna de las 4 variables | lee el mensaje: `docker compose -f docker-compose.demo.yml logs api` |
| «No llegó» con código `DEMO_NO_PERMITIDO` | el celular no está en `DEMO_TELEFONOS_PRUEBA` (resguardo de la demo) | agrégalo al `.env` y vuelve a «Restablecer datos demo» |
| El paciente queda «No llegó», código `131030` | el celular no está en la lista de destinatarios de prueba | agrégalo en el paso 3 |
| Código `132000` / `132001` | el número de variables o el nombre/idioma de la plantilla no coinciden | revisa el paso 4 (3 variables, idioma Español `es`, nombre exacto) |
| Código `190` / `401` | token vencido (el temporal dura 24 h) | genera otro o usa un token de usuario del sistema |
| Código `131047` | pasaron más de 24 h desde la última respuesta del usuario | normal para textos libres fuera de ventana; las plantillas sí pasan |
| Meta no valida el webhook | el túnel cambió de dirección o el token de verificación no coincide | repite el paso 7 |
| Toco el botón y no cambia nada | falta el webhook o no te suscribiste a `messages` | paso 7 |
| «Plantilla pendiente» | Meta aún no la aprueba | espera; mientras tanto puedes enviar la plantilla de prueba `hello_world` a mano desde el panel de Meta |

## Para el piloto real (más adelante)

- **Número propio** (no el de prueba), con nombre visible aprobado y **verificación del negocio** en Meta.
- Un **único número para todos los Cesfam de Rancagua** (decisión del cliente); el nombre del Cesfam va en la variable `{{1}}`.
- Aceptar el anexo de tratamiento de datos de Meta (transferencia internacional) y dejar constancia en el [registro de tratamiento](privacidad/REGISTRO_TRATAMIENTO.md).
- Resolver la **base legal** y el convenio antes de usar datos de pacientes reales (decisiones del cliente).
- Revisar los costos por conversación de plantillas de utilidad en el panel de Meta y fijar un presupuesto mensual.
