#!/bin/sh
set -eu
# Fail closed before serving a publicly proxied API.
: "${PHOTO2SIM_API_TOKEN:?Set the private application access token}"
: "${PHOTO2SIM_DATA_DIR:=/data/jobs}"
export PHOTO2SIM_DATA_DIR
# Railway mounts volumes at runtime as root. Prepare only this app's directory,
# then drop privileges before running the server. Never recursively chown assets.
if [ "$(id -u)" = 0 ]; then
    mkdir -p "$PHOTO2SIM_DATA_DIR"
    chown app:app "$PHOTO2SIM_DATA_DIR"
    exec gosu app "$0" "$@"
fi
test -w "$PHOTO2SIM_DATA_DIR" || { echo 'Job storage is not writable' >&2; exit 1; }
exec python -m uvicorn photo2sim.api.app:create_app --factory --host :: --port "${PORT:-8000}" --workers 1
