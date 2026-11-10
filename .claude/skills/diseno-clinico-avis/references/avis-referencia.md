# Calibración con AVIS (por completar)

AVIS es la plataforma de registro clínico electrónico de APS con módulos de Agenda, Atención Clínica, Farmacia y Bodega. No hay documentación pública de su interfaz, por lo que esta referencia se completa con el CESFAM.

## Qué levantar (sin datos de pacientes)
- [ ] 2–3 capturas de pantalla de AVIS **con datos ficticios o difuminados** (agenda y ficha), guardadas en `docs/mvp/avis/` (fuera del bundle de la app).
- [ ] Resolución y número de monitores de los puestos del call center.
- [ ] Navegador y versión usados (afecta soporte de CSS).
- [ ] ¿AVIS se usa en navegador o cliente de escritorio? ¿Permite abrir aplicaciones externas o embebidas (SMART on FHIR / iframe)?
- [ ] Columnas exactas de la exportación de agenda (nombres de encabezado, formatos de fecha/hora/RUT).
- [ ] Colores y terminología de estados de cita en AVIS (para **no contradecirlos**: si AVIS usa verde para "Atendido", evaluar el tono de "Confirmado").
- [ ] Atajos de teclado que usan en AVIS (para no colisionar).

## Reglas de calibración
1. Si un estado existe en ambos sistemas, usar **el mismo nombre** que AVIS en la interfaz y registrar la equivalencia en `packages/fhir` (CodeSystem local).
2. Si los colores de AVIS chocan con la semántica de `tokens.css`, se ajusta el **tono** del token manteniendo contraste AA; nunca se reasigna el significado.
3. Registrar aquí cada decisión con fecha.

## Registro de decisiones
| Fecha | Observación en AVIS | Decisión en BusinessHub |
|---|---|---|
| | | |
