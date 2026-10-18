#!/bin/sh
# macOS bootstrap: download -> SHA256 -> backed-up migration. Never restarts DSH.
set -eu
APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
[ "$(uname -s)" = Darwin ] || { echo 'Use scripts/install.ps1 on Windows.' >&2; exit 1; }
RUNTIME="$APP/Contents/MacOS/DeepSeek Harness"
[ -x "$RUNTIME" ] || { echo 'DSH Desktop not found. Set DSH_APP to its .app path.' >&2; exit 1; }
TMP=$(mktemp -d "${TMPDIR:-/tmp}/purge-bootstrap.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --connect-timeout 20 --max-time 90 https://raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/bootstrap-install.mjs -o "$TMP/bootstrap-install.mjs"
if [ -n "${PURGE_VERSION:-}" ]; then set -- "--version=$PURGE_VERSION" "$@"; fi
ELECTRON_RUN_AS_NODE=1 "$RUNTIME" "$TMP/bootstrap-install.mjs" "$@"
