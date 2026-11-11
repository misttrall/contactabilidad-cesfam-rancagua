#!/usr/bin/env bash
# Respaldo CIFRADO de la base de datos (pg_dump formato custom + AES-256-CBC/PBKDF2 con openssl).
#
#   RESPALDO_CLAVE_ARCHIVO=/ruta/clave.txt  ./respaldar.sh [directorio-salida]
#
# Conexión (una de las dos):
#   - PG_CONTENEDOR=<nombre>   usa `docker exec` en ese contenedor de Postgres (desarrollo/QA con Docker);
#   - o las variables estándar PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE con pg_dump instalado.
#
# La clave del respaldo es DISTINTA de DATA_ENCRYPTION_KEY y se guarda aparte (gestor de secretos).
# Sin ella el respaldo es irrecuperable: probar la restauración (probar-restauracion.sh) es obligatorio.
set -euo pipefail

SALIDA="${1:-./respaldos}"
BD="${PGDATABASE:-businesshub}"
USUARIO="${PGUSER:-businesshub}"
: "${RESPALDO_CLAVE_ARCHIVO:?Define RESPALDO_CLAVE_ARCHIVO (archivo con la clave de cifrado, ≥ 32 caracteres)}"
[ -s "$RESPALDO_CLAVE_ARCHIVO" ] || { echo "La clave $RESPALDO_CLAVE_ARCHIVO no existe o está vacía" >&2; exit 2; }
[ "$(wc -c < "$RESPALDO_CLAVE_ARCHIVO")" -ge 32 ] || { echo "La clave debe tener al menos 32 caracteres" >&2; exit 2; }

mkdir -p "$SALIDA"
ESTAMPA="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVO="$SALIDA/${BD}_${ESTAMPA}.dump.enc"
TMP="$(mktemp "$ARCHIVO.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

volcar() {
  if [ -n "${PG_CONTENEDOR:-}" ]; then
    docker exec -i "$PG_CONTENEDOR" pg_dump -U "$USUARIO" -d "$BD" -Fc --no-owner --no-privileges
  else
    pg_dump -d "$BD" -Fc --no-owner --no-privileges
  fi
}

# El volcado no toca el disco en claro: va directo al cifrado.
volcar | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass "file:$RESPALDO_CLAVE_ARCHIVO" -out "$TMP"
[ -s "$TMP" ] || { echo "El respaldo quedó vacío" >&2; exit 1; }
mv "$TMP" "$ARCHIVO"
trap - EXIT
# Suma de verificación del archivo cifrado: detecta corrupción o alteración en el almacenamiento.
( cd "$SALIDA" && sha256sum "$(basename "$ARCHIVO")" > "$(basename "$ARCHIVO").sha256" )
chmod 600 "$ARCHIVO" "$ARCHIVO.sha256" 2>/dev/null || true
echo "$ARCHIVO"
