#!/bin/sh
set -e
mkdir -p "${PUNCHLIST_DATA_DIR:-/data/.punchlist}"
exec "$@"
