---
name: diseno-clinico-avis
description: Sistema de diseño clínico de BusinessHub Salud (contactabilidad CESFAM Rancagua). Úsala SIEMPRE antes de crear o modificar cualquier pantalla, componente, estilo, token, ícono, texto de interfaz o gráfico del frontend (apps/web, packages/ui), y al revisar UI. Define estética para salud pública chilena, convivencia con la plataforma AVIS (uso lado a lado), tokens, estados de cita, densidad, accesibilidad WCAG 2.2 AA, convenciones chilenas (RUT, fechas) y privacidad en pantalla.
---

# Diseño clínico BusinessHub Salud × AVIS

Diseñas para **funcionarias de call center de APS** que trabajan 8 horas con **AVIS abierto al mismo tiempo**, haciendo ~150 contactos al día. La interfaz es una herramienta de trabajo, no un producto de marketing: **rápida, sobria, densa, predecible y segura con datos de pacientes**.

Antes de escribir UI, lee según la tarea:
- `references/tokens.css` — fuente única de colores, tipografía, espaciado, radios, sombras. Nunca uses colores sueltos.
- `references/componentes.md` — especificación de componentes (badges de estado, tablas, RUT input, paneles, banners).
- `references/pantallas.md` — patrones por pantalla del MVP y layouts lado a lado con AVIS.
- `references/avis-referencia.md` — calibración con la interfaz de AVIS (completar con capturas **ficticias**).

## 1. Principios (en orden de prioridad)

1. **Seguridad del paciente y privacidad primero.** Nunca mostrar diagnósticos ni datos clínicos que no se necesitan para contactar. Enmascarar RUT y teléfono en listas (`12.345.***-9`, `+569 ****  5678`) y revelarlos con acción explícita (queda en auditoría).
2. **Convivir con AVIS, no competir.** Nuestra app ocupa la mitad derecha de la pantalla (o una ventana lateral) mientras AVIS ocupa la izquierda. Todo debe funcionar desde **640 px de ancho** útiles y en 1366×768 (equipos municipales típicos). Paleta neutra y discreta para no "pelear" visualmente con AVIS; el color se reserva para **estado y acción**.
3. **Velocidad operativa.** Registrar una llamada entrante en < 30 s (RNF-09). Foco inicial en el campo RUT, todo operable con teclado, `Enter` confirma, atajos visibles.
4. **Estados inequívocos.** Cada estado de cita = color + ícono + texto. Jamás solo color (daltonismo ~8 % de hombres).
5. **Regla de negocio visible:** "Sin respuesta" **nunca** se pinta como error/rojo ni se acerca visualmente a "Cancelado".
6. **Consistencia institucional.** Lenguaje y tono de servicio público chileno: claro, formal-cercano, en español de Chile, sin anglicismos ("Cargar planilla", no "Upload").

## 2. Identidad visual

- **Estética:** "clínica institucional": fondos blanco/gris muy claro, un azul petróleo como color primario (confiable, sanitario, distinto del azul de enlaces y del verde de éxito), superficies planas con bordes finos en vez de sombras grandes.
- **Tipografía:** `Inter` (autoalojada en `apps/web/public/fonts`, **no** Google Fonts: evita enviar IP de funcionarios a terceros) con `font-variant-numeric: tabular-nums` en RUT, horas, teléfonos y cifras. Respaldo: `system-ui`. Tamaño base 14 px (densidad de trabajo), nunca < 12 px; títulos de página 20 px.
- **Íconos:** `lucide-react`, trazo 1.75, 16 px en tablas y 20 px en navegación. Un ícono por concepto, fijo (ver tabla de estados).
- **Marca:** logotipo BusinessHub Salud pequeño en la barra lateral; el nombre del **Cesfam activo** pesa más que nuestra marca.
- **Ambiente:** franja superior de 4 px + etiqueta con el ambiente: `DEMO · datos ficticios` (violeta), `QA` (ámbar), `PRODUCCIÓN` (sin franja). Cumple RNF-02 en todas las pantallas.

## 3. Estados de la cita (semántica fija)

| Estado | Token | Ícono lucide | Texto |
|---|---|---|---|
| Sin enviar | `--estado-sin-enviar` (gris pizarra) | `CircleDashed` | Sin enviar |
| Enviado | `--estado-enviado` (azul) | `Send` | Enviado · esperando respuesta |
| Confirmado | `--estado-confirmado` (verde) | `CircleCheck` | Confirmado |
| Sin respuesta | `--estado-sin-respuesta` (ámbar) | `PhoneMissed` | Sin respuesta · llamar |
| Cancelado | `--estado-cancelado` (granate) | `CircleX` | Cancelado por paciente |
| Recado / No ubicado | subestados de Sin respuesta, misma familia ámbar | `MessageSquareDot` / `UserX` | Recado dejado / No ubicado |

Distintivos de prioridad (independientes del estado): **Adulto mayor ≥ 65** (`--prioridad-am`, ícono `HeartHandshake`), **Crónico** vs **Morbilidad** (etiqueta neutra con borde).

## 4. Reglas de layout

- **Shell:** barra lateral colapsable (240 px / 56 px), encabezado de 48 px con: Cesfam activo (selector solo para encargado/administrador), buscador global por RUT (`Ctrl+K`), usuario y cierre de sesión.
- **Modo lado a lado (<= 960 px):** barra lateral colapsada por defecto, tablas pasan a lista de tarjetas compactas, paneles de detalle se abren como *drawer* a la derecha en lugar de columna fija.
- **Densidad:** filas de tabla de 36 px (compacta) por defecto; opción "cómoda" 44 px en preferencias.
- **Embebible:** sin `100vw` ni `position: fixed` que asuman pantalla completa; respeta el contenedor (posible iframe/SMART on FHIR launch desde AVIS).
- **Espaciado:** escala de 4 px (`--space-1` … `--space-8`). Separación entre bloques 16–24 px.

## 5. Accesibilidad (obligatorio, WCAG 2.2 AA)

- Contraste ≥ 4.5:1 texto y ≥ 3:1 componentes/bordes de foco. Los tokens ya cumplen; no los aclares.
- Foco visible (`--focus-ring`) en todo elemento interactivo; orden de tabulación lógico; objetivos ≥ 24×24 px.
- Formularios con `<label>` visible, error textual junto al campo y en `aria-live`.
- No depender de hover; tooltips también por foco.
- Respeta `prefers-reduced-motion`; animaciones ≤ 150 ms.

## 6. Convenciones chilenas y de contenido

- **RUT:** se escribe con puntos y guion `12.345.678-9`, se valida dígito verificador (módulo 11) mientras se digita; acepta `K`/`k`.
- **Fechas:** `lun 28-10-2026`, horas 24 h `09:30`. Zona `America/Santiago`. Fechas relativas solo como apoyo ("mañana").
- **Teléfono:** `+56 9 1234 5678`.
- **Tono:** verbos en infinitivo en botones ("Enviar confirmación", "Registrar llamada"), mensajes de error que dicen qué hacer ("El RUT no es válido: revisa el dígito verificador").
- **Mensajes a pacientes (WhatsApp):** nunca incluir prestación diagnóstica sensible ("Control DM2" → "control de salud"), siempre fecha explícita, nombre del Cesfam y respuesta Sí/No.

## 7. Datos y gráficos

- Dashboard: tarjetas KPI con cifra tabular grande, variación y enlace a la lista filtrada.
- Gráficos con la paleta de estados (mismo color = mismo estado en toda la app). Siempre tabla accesible alternativa o etiquetas de valor.
- Sin gráficos de torta con > 5 segmentos: usar barras horizontales ordenadas.

## 8. Lo que NO se hace

- Gradientes, glassmorphism, ilustraciones decorativas, emojis en UI, sombras grandes, colores de marca saturados.
- Rojo para algo que no sea cancelación, error o acción destructiva.
- Modales para flujos frecuentes (usar paneles/drawers); confirmación modal solo para acciones irreversibles o masivas ("Enviar a 48 pacientes").
- Datos de pacientes con apariencia real en mocks: usar RUT y nombres claramente ficticios (p. ej. "Paciente Demo 001", RUT de prueba válidos marcados).
- Copiar la marca, logos o capturas reales de AVIS en el producto.

## 9. Checklist antes de entregar una pantalla

- [ ] Usa solo tokens de `tokens.css` (sin hex sueltos).
- [ ] Funciona a 640 px, 1366×768 y 1920×1080.
- [ ] Navegable 100 % con teclado; foco inicial correcto.
- [ ] Estados con ícono + texto + color.
- [ ] RUT/teléfono enmascarados en listas; revelación auditada.
- [ ] Banner de ambiente visible fuera de producción.
- [ ] Textos en español de Chile, sin datos clínicos innecesarios.
- [ ] Prueba de contraste y `axe` sin errores (Playwright + @axe-core).
