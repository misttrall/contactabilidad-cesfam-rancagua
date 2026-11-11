#!/usr/bin/env bash
# Restaura un respaldo cifrado en una base de datos NUEVA (nunca sobre la de producción en uso).
#
#   RESPALDO_CLAVE_ARCHIVO=/ruta/clave.txt  ./restaurar.sh <archivo.dump.enc> <base-destino>
#
# Misma conexión que respaldar.sh (PG_CONTENEDOR o variables PG*). Si la base destino ya existe,
# se niega: restaurar sobre datos vivos es una decisión humana (borrarla antes, a propósito).
set -euo pipefail

ARCHIVO="${1:?Uso: restaurar.sh <archivo.dump.enc> <base-destino>}"
DESTINO="${2:?Uso: restaurar.sh <archivo.dump.enc> <base-destino>}"
USUARIO="${PGUSER:-businesshub}"
: "${RESPALDO_CLAVE_ARCHIVO:?Define RESPALDO_CLAVE_ARCHIVO}"
[[ "$DESTINO" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "Nombre de base no válido: $DESTINO" >&2; exit 2; }

# 1. Integridad del archivo cifrado.
if [ -f "$ARCHIVO.sha256" ]; then
  ( cd "$(dirname "$ARCHIVO")" && sha256sum -c "$(basename "$ARCHIVO").sha256" >/dev/null ) \
    || { echo "La suma de verificación NO coincide: el respaldo está dañado o fue alterado" >&2; exit 3; }
else
  echo "Advertencia: no hay $ARCHIVO.sha256; no se puede verificar la integridad previa" >&2
fi

psql_() {
  if [ -n "${PG_CONTENEDOR:-}" ]; then docker exec -i "$PG_CONTENEDOR" psql -U "$USUARIO" -d postgres -v ON_ERROR_STOP=1 "$@"
  else psql -d postgres -v ON_ERROR_STOP=1 "$@"; fi
}
restore_() {
  if [ -n "${PG_CONTENEDOR:-}" ]; then docker exec -i "$PG_CONTENEDOR" pg_restore -U "$USUARIO" -d "$DESTINO" --no-owner --no-privileges --exit-on-error
  else pg_restore -d "$DESTINO" --no-owner --no-privileges --exit-on-error; fi
}

EXISTE="$(psql_ -tAc "SELECT 1 FROM pg_database WHERE datname='$DESTINO'")"
[ -z "$EXISTE" ] || { echo "La base $DESTINO ya existe; no se restaura sobre ella" >&2; exit 4; }
psql_ -c "CREATE DATABASE \"$DESTINO\"" >/dev/null

# 2. Descifra y restaura sin dejar el volcado en claro en disco.
if ! openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass "file:$RESPALDO_CLAVE_ARCHIVO" -in "$ARCHIVO" | restore_; then
  psql_ -c "DROP DATABASE IF EXISTS \"$DESTINO\"" >/dev/null || true
  echo "Falló la restauración (¿clave incorrecta o respaldo dañado?). Se eliminó la base $DESTINO." >&2
  exit 5
fi
echo "Restaurado en la base $DESTINO"
