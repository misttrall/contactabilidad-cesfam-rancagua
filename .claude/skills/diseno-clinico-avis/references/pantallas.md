# Patrones por pantalla del MVP

Layout de referencia en modo convivencia con AVIS (1366 px: AVIS ~700 px a la izquierda, BusinessHub ~666 px a la derecha):

```
┌──────────── AVIS ────────────┐┌──────── BusinessHub Salud ────────┐
│ ficha / agenda del paciente  ││ ▌DEMO · datos ficticios           │
│                              ││ ≡  CESFAM Centro ▾   [RUT ⌘K]  CS │
│                              ││───────────────────────────────────│
│                              ││ Pendientes por llamar (23)        │
│                              ││ [Adulto mayor primero ▾] [Hoy ▾]  │
│                              ││ ┌───────────────────────────────┐ │
│                              ││ │ 09:30 Paciente Demo 014  AM   │ │
│                              ││ │ ⚠ Sin respuesta · llamar  [▶] │ │
│                              ││ └───────────────────────────────┘ │
└──────────────────────────────┘└───────────────────────────────────┘
```

## Inicio de sesión
- Keycloak con tema propio (tokens) — logo, nombre del sistema, banner de ambiente, aviso legal de uso de datos de salud (Ley 20.584 / 21.719).

## Dashboard (`/`)
- Fila de 7 KPI: Cargadas, Por enviar, Enviadas, Confirmadas, Sin respuesta, Canceladas, Llamadas entrantes (hoy real, zona America/Santiago). Cada KPI enlaza a la lista filtrada.
- Debajo: "Próximas a confirmar" (tabla compacta) y "Llamadas entrantes recientes".
- Funcionaria ve solo su centro; encargado tiene selector de centro o "Todos".

## Cargar planilla AVIS (`/cargas/nueva`)
- Asistente de 3 pasos en una sola página: 1) Centro y archivo (zona de arrastre + "Descargar plantilla"); 2) Validación: resumen "142 filas · 120 crónicas · 18 morbilidad excluidas · 4 con errores" y tabla de errores por fila con columna y motivo; 3) Confirmar importación.
- Aviso permanente: "El archivo se procesa y se descarta; no se almacena."

## Confirmación masiva (`/confirmaciones`)
- Filtros: fecha de cita, tipo (Crónico por defecto), profesional. Tabla con selección masiva y barra de acciones. Panel lateral con vista previa del mensaje renderizado para la primera cita seleccionada.

## Pendientes por llamar (`/pendientes`)
- Cola de trabajo ordenada: adulto mayor primero, luego hora de cita. Al registrar un resultado la fila sale de la cola (corrige D-06) y el foco pasa a la siguiente.
- Drawer de llamada: datos de contacto (con copiar teléfono), historial de contactos de la cita (envío, entrega, lectura, llamadas previas), `RegistroResultadoLlamada`.

## Llamada entrante (`/llamadas/nueva`)
- Optimizada para < 30 s: foco automático en `RutInput` → `Enter` busca → tarjeta de paciente (o "Paciente no encontrado: registrar solo con RUT") → motivo con combobox buscable y atajos para los 3 más usados → observación opcional → `Ctrl+Enter` registra. Contador de tiempo discreto para piloto (métrica 14.1).

## Historial (`/llamadas`)
- Tabla con filtros por fecha, centro, motivo, funcionaria; búsqueda por RUT; paginación servidor; exportar Excel (solo encargado/administrador, auditado).

## Reportes (`/reportes`)
- Filtros centro y período (hoy, ayer, 7 días, 30 días, rango). Barras apiladas de estados por centro (colores de estado), motivos en barras horizontales ordenadas, tabla por tramo etario y sexo. Todo calculado desde la API. Exportar Excel.

## Configuración (`/configuracion`, administrador)
- Pestañas: Plantillas WhatsApp (con estado de aprobación en Meta y previsualización), Centros, Usuarios y roles (lectura desde Keycloak + asignación de centro), Catálogo de motivos (activar/desactivar, ordenar), Parámetros (anticipación de envío, segundo mensaje a adultos mayores, ventana horaria de envío).
