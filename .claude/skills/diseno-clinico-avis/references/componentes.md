# Componentes del design system (`packages/ui`)

Todos se construyen sobre primitivas **Radix UI** (accesibilidad) y se estilizan solo con tokens. Cada componente exporta tipos estrictos y tiene historia en Storybook (o Ladle) con estados: normal, foco, deshabilitado, error, cargando, vacío.

## EstadoCitaBadge
- Props: `estado: 'sin_enviar' | 'enviado' | 'confirmado' | 'sin_respuesta' | 'cancelado'`, `subestado?: 'recado' | 'no_ubicado'`, `size?: 'sm' | 'md'`.
- Render: píldora `--radius-sm`, borde 1 px `--estado-*-border`, fondo `--estado-*-bg`, texto `--estado-*-fg`, ícono 14 px a la izquierda + texto. Nunca solo ícono.
- El mapeo estado→ícono→texto vive en **un único archivo** (`estado-cita.ts`) compartido con gráficos y exportaciones.

## PrioridadTag
- "Adulto mayor" (≥ 65 años) con tokens `--prioridad-am-*`; "Crónico"/"Morbilidad" como etiqueta neutra con borde `--color-border-strong`.

## RutInput
- Input 16 px, `inputmode="text"`, `autocomplete="off"`, máscara en vivo `12.345.678-9`, acepta `k/K`.
- Valida módulo 11 al perder foco o al presionar `Enter`; error textual: "RUT no válido: revisa el dígito verificador".
- `Enter` con RUT válido dispara la búsqueda. Expone el valor normalizado `12345678-9` (sin puntos) para la API y para `Patient.identifier`.

## DatoSensible (RUT / teléfono enmascarado)
- Muestra `12.345.***-9` / `+56 9 **** 5678`. Botón "Mostrar" (ícono `Eye`) revela por 30 s y registra `AuditEvent` vía API. Copiar al portapapeles con un clic (`Copy`) para llamar desde el teléfono/AVIS.

## TablaClinica
- TanStack Table + virtualización. Cabecera fija `--color-surface-muted`, filas `--row-h-compact`, zebra opcional, fila activa `--color-primary-subtle` con barra izquierda 3 px `--color-primary`.
- Columnas numéricas/RUT/hora alineadas a la derecha o con `tabular-nums`.
- Selección masiva: checkbox en cabecera con estado indeterminado; barra de acciones fija abajo "48 seleccionadas · Enviar confirmación · Limpiar". La selección **se limpia al cambiar filtros** (corrige D-05).
- Estado vacío con explicación y acción ("No hay citas sin enviar para mañana. Cargar planilla").
- En ≤ 960 px se transforma en `ListaTarjetas` (nombre, hora, estado, acción principal).

## PanelDetalle / Drawer
- Lateral derecho `--drawer-w`, `--shadow-md`, cierre con `Esc`, foco atrapado y devuelto al origen. Usado para detalle de paciente y registro de resultado de llamada.

## RegistroResultadoLlamada
- Cuatro botones de opción grandes (radio group visual) con atajos `1`–`4`: Confirmado / Recado / No ubicado / Cancelado. Un único botón primario "Registrar resultado" (reemplaza el doble selector del prototipo, más rápido y sin ambigüedad).
- Recado y No ubicado muestran la nota fija: "La cita sigue vigente. Sin respuesta nunca cancela la hora."

## BannerAmbiente
- Franja 4 px + etiqueta en el header: "DEMO · Datos ficticios · No es un sistema oficial del CESFAM". Obligatorio fuera de producción (lee `VITE_AMBIENTE`).

## AvisoRegla
- Caja informativa (no alerta roja) con `--color-warning-bg` e ícono `Info` para reglas de negocio: RN-01, exclusión de morbilidad, etc.

## KpiCard
- Etiqueta 13 px `--color-text-secondary`, cifra `--text-kpi` semibold tabular, variación vs ayer, toda la tarjeta enlaza a la lista filtrada.

## Botones
- Primario (`--color-primary`), secundario (borde `--color-border-strong`, fondo surface), terciario (texto), destructivo (`--color-danger`). Alto 32 px (compacto) / 36 px. Ícono opcional a la izquierda. Estado cargando mantiene el ancho y muestra spinner + verbo en gerundio ("Enviando…").

## Toast / notificaciones
- Esquina inferior derecha, `aria-live="polite"`, 5 s, nunca contienen datos del paciente más allá del nombre de pila.

## ConfirmacionMasiva (diálogo)
- Único caso de modal: resumen "Se enviará WhatsApp a 48 pacientes de CESFAM Centro para citas del lun 28-10-2026. 3 sin teléfono válido quedarán en Pendientes." + vista previa del mensaje final.
