# Demo local — BusinessHub Salud en tu PC (Docker)

Todo el sistema corre en Docker en tu computador: web, API, base de datos, Redis y el login (Keycloak). Sin nube, sin cuentas externas. **Datos 100 % ficticios** y WhatsApp **simulado** (no sale nada a internet).

## Requisitos

- **Docker Desktop** abierto (el ícono de la ballena en verde).
- Puertos libres: **5173** (web), **3001** (API) y **8081** (login). Si tienes otro servicio en el 3001, cambia `DEMO_API_PORT` (ver abajo). Si usas `pnpm infra:up` para desarrollar, detenlo antes (`pnpm infra:down`): comparte el 8081.
- Unos 6 GB libres de disco. No hace falta instalar Node.

## Encender y apagar

Desde la carpeta del proyecto:

```bash
docker compose -f docker-compose.demo.yml up -d --build   # equivale a: pnpm demo:up
```

La primera vez tarda varios minutos (descarga imágenes y construye). Las siguientes, segundos. Cuando termine, abre **http://localhost:5173**.

| Acción | Comando | Con pnpm |
|---|---|---|
| Encender | `docker compose -f docker-compose.demo.yml up -d --build` | `pnpm demo:up` |
| Apagar (conserva los datos) | `docker compose -f docker-compose.demo.yml down` | `pnpm demo:down` |
| Borrar todo y empezar de cero | `docker compose -f docker-compose.demo.yml down -v` | `pnpm demo:reset` |
| Ver registros | `docker compose -f docker-compose.demo.yml logs -f api` | `pnpm demo:logs` |

Para usar otro puerto de API: `DEMO_API_PORT=3002 docker compose -f docker-compose.demo.yml up -d --build` (en PowerShell: `$env:DEMO_API_PORT=3002` antes del comando).

## Usuarios de la demo (ficticios)

Contraseña de todos: `Demo-1234!`

| Usuario | Rol | Qué ve |
|---|---|---|
| `funcionaria.csc` | Funcionaria | solo CESFAM Centro |
| `funcionaria.csn` | Funcionaria | solo CESFAM Norte |
| `encargado.demo` | Encargado | todos los centros, reportes |
| `admin.demo` | Administrador | todo, incluida la Configuración |

## Preparar los datos (antes de que llegue el cliente)

1. Entra como `admin.demo` → **Configuración** → baja hasta «Restablecer datos demo», escribe `RESTABLECER` y confírmalo. Carga citas ficticias para mañana en cada centro.
2. **Horario de envío:** los mensajes solo «salen» entre las 09:00 y las 18:00 (hora de Chile). Si muestras fuera de ese horario, en **Configuración → Parámetros** abre la ventana (p. ej. 00:00 a 23:59) o los mensajes quedarán programados para el día siguiente.
3. En **Configuración → Centros** puedes poner el **teléfono de contacto** de cada Cesfam (aparece en el mensaje de reagendamiento).

## Guion sugerido (10 minutos)

1. **Funcionaria** (`funcionaria.csc`): *Confirmación masiva* → las horas de mañana, adultos mayores primero → seleccionar todas → **Enviar** (el diálogo muestra a cuántos y no revela diagnósticos) → **Simular respuestas de pacientes (demo)** → ver confirmados, cancelados y «Horas por liberar en AVIS».
2. *Pendientes por llamar*: quienes no respondieron aparecen como **«Sin respuesta · llamar»**, nunca como cancelados. Registrar el resultado de una llamada.
3. *Llamada entrante*: escribir el RUT `1000000-9`, motivo, **Registrar** (meta: menos de 30 s). Mostrar que en el *Historial* el RUT sale enmascarado y «Revelar» queda auditado.
4. **Encargado** (`encargado.demo`): *Inicio* (indicadores del día) y *Reportes* (métricas del piloto, **Exportar a Excel**: solo cifras, sin datos de pacientes).
5. **Administrador** (`admin.demo`): *Configuración* (centros, motivos, usuarios, parámetros).
6. Lado a lado con AVIS: reducir la ventana del navegador a ~640 px y mostrar que sigue utilizable.

## Qué es real y qué es simulado

- **Real:** login con roles, base de datos, reglas de negocio, auditoría, cifrado del teléfono, reportes y la exportación a Excel.
- **Simulado:** WhatsApp por defecto (las respuestas se simulan con el botón de demo; para WhatsApp real a los celulares del equipo, ver [WHATSAPP.md](WHATSAPP.md)) y la agenda de AVIS (se carga una planilla de ejemplo; no hay integración).

## Si algo falla

- **«No abre localhost:5173»**: espera 1–2 minutos tras encender (el login tarda en arrancar) y revisa `docker compose -f docker-compose.demo.yml ps`: todo debe estar `healthy`/`running`.
- **Puerto ocupado** (`address already in use`): apaga lo que use ese puerto o cambia `DEMO_API_PORT`. El 5173 y el 8081 son fijos (el login solo acepta esas direcciones).
- **Docker no responde**: abre Docker Desktop y espera a que diga «Engine running».
- **Empezar limpio**: `docker compose -f docker-compose.demo.yml down -v` y volver a encender.
- **El login muestra otra contraseña pedida / error de usuario**: los usuarios son los de la tabla; si los cambiaste en Keycloak, usa `down -v` para restaurarlos.

> La clave y los usuarios de esta demo son **públicos** (están en el repositorio). Nunca la expongas a internet ni cargues datos reales.
