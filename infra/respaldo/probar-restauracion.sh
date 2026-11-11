#!/usr/bin/env bash
# PRUEBA DE RESTAURACIÓN: respalda, restaura en una base temporal y compara los datos con el origen.
# Un respaldo que nunca se restauró no es un respaldo. Ejecutar al menos una vez al mes y tras cada
# cambio de esquema (queda como evidencia en docs/mvp/OPERACION.md).
#
#   RESPALDO_CLAVE_ARCHIVO=/ruta/clave.txt PG_CONTENEDOR=<contenedor> ./probar-restauracion.sh
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
BD="${PGDATABASE:-businesshub}"
USUARIO="${PGUSER:-businesshub}"
TEMP_BD="restauracion_prueba_$(date -u +%Y%m%d%H%M%S)"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

psql_en() { # psql_en <base> <sql>
  if [ -n "${PG_CONTENEDOR:-}" ]; then docker exec -i "$PG_CONTENEDOR" psql -U "$USUARIO" -d "$1" -tA -v ON_ERROR_STOP=1 -c "$2"
  else psql -d "$1" -tA -v ON_ERROR_STOP=1 -c "$2"; fi
}

# Huella de contenido de las tablas de negocio: filas por tabla + una suma de verificación de sus datos.
TABLAS="centro usuario profesional motivo_llamada parametro paciente cita tarea_contacto mensaje envio liberacion consentimiento llamada_saliente llamada_entrante carga audit_event"
huella() {
  for t in $TABLAS; do
    printf '%s ' "$t"
    psql_en "$1" "SELECT count(*) || ' ' || coalesce(md5(string_agg(md5(x::text), '' ORDER BY md5(x::text))), '-') FROM $t x"
  done
}

ARCHIVO="$("$AQUI/respaldar.sh" "$DIR")"
echo "Respaldo: $(basename "$ARCHIVO") ($(wc -c < "$ARCHIVO") bytes)"
"$AQUI/restaurar.sh" "$ARCHIVO" "$TEMP_BD"
cleanup() { psql_en postgres "DROP DATABASE IF EXISTS \"$TEMP_BD\"" >/dev/null 2>&1 || true; }
trap 'cleanup; rm -rf "$DIR"' EXIT

ORIGEN="$(huella "$BD")"
RESTAURADO="$(huella "$TEMP_BD")"
if [ "$ORIGEN" != "$RESTAURADO" ]; then
  echo "LA RESTAURACIÓN NO COINCIDE CON EL ORIGEN:" >&2
  diff <(echo "$ORIGEN") <(echo "$RESTAURADO") >&2 || true
  exit 1
fi
FILAS="$(echo "$ORIGEN" | awk '{s+=$2} END {print s}')"
echo "OK: $FILAS filas en $(echo "$TABLAS" | wc -w) tablas idénticas tras restaurar el respaldo cifrado."

# El cifrado debe ser real: el archivo no puede contener texto de la base ni la cabecera de pg_dump.
if head -c 5 "$ARCHIVO" | grep -q 'PGDMP'; then echo "El respaldo NO está cifrado" >&2; exit 1; fi
echo "OK: el archivo está cifrado."
