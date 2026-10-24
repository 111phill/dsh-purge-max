#!/bin/sh
# macOS/Linux bootstrap: download -> SHA256 -> backed-up migration. Never restarts DSH.
set -eu
for arg do
  case "$arg" in
    --help|-h)
      cat <<'HELP'
Usage: sh scripts/install.sh [--dry-run] [--version=X.Y.Z] [--profile=NAME]
       sh scripts/install.sh --archive=/path/package.tgz --sha256=HEX [--version=X.Y.Z]
Linux: existing DSH CLI/Web, Node >=18, default profile web.
  PURGE_DSH_CLI selects a CLI (default: dsh on PATH); DSH_NODE selects Node.
Desktop: DSH_APP selects the executable on Linux or the .app on macOS.
  Uses the selected Desktop's Electron runtime; default profile desktop.
DSH_HOME selects the data directory. Open DSH once to initialize the profile.
Installation preserves settings and never applies host patches or restarts DSH.
HELP
      exit 0 ;;
  esac
done
case "$(uname -s)" in
  Darwin)
    APP="${DSH_APP:-/Applications/DeepSeek Harness.app}"
    APP="$(CDPATH= cd -P "$APP" && pwd -P)" || { echo 'Selected application does not exist.' >&2; exit 1; }
    PLIST="$APP/Contents/Info.plist"
    [ -f "$PLIST" ] && [ ! -L "$PLIST" ] || { echo 'Selected application needs a regular Info.plist; no fallback used.' >&2; exit 1; }
    EXE_NAME="$(/usr/bin/plutil -extract CFBundleExecutable raw -expect string -n -o - "$PLIST" && printf '.')" || {
      echo 'Cannot read CFBundleExecutable; no fallback used.' >&2; exit 1;
    }
    EXE_NAME=${EXE_NAME%.}
    case "$EXE_NAME" in ''|.|..|*/*|*\\*|*'
'*) echo 'Invalid CFBundleExecutable.' >&2; exit 1 ;; esac
    if printf '%s' "$EXE_NAME" | LC_ALL=C grep '[[:cntrl:]]' >/dev/null; then
      echo 'Invalid control character in CFBundleExecutable.' >&2; exit 1
    fi
    EXEC_DIR="$(CDPATH= cd -P "$APP/Contents/MacOS" && pwd -P)" || exit 1
    [ "$EXEC_DIR" = "$APP/Contents/MacOS" ] || { echo 'Executable directory escapes the application.' >&2; exit 1; }
    RUNTIME="$EXEC_DIR/$EXE_NAME"
    [ ! -L "$RUNTIME" ] || { echo 'Symlinked executable requires explicit manual verification; no fallback used.' >&2; exit 1; }
    PURGE_INSTALL_MODE=desktop ;;
  Linux)
    if [ -n "${DSH_APP:-}" ]; then
      RUNTIME="$DSH_APP"
      PURGE_INSTALL_MODE=desktop
    else
      RUNTIME="${DSH_NODE:-$(command -v node || true)}"
      PURGE_DSH_CLI="${PURGE_DSH_CLI:-$(command -v dsh || true)}"
      [ -n "$PURGE_DSH_CLI" ] && [ -f "$PURGE_DSH_CLI" ] || {
        echo 'DSH CLI not found. Install DSH first or set PURGE_DSH_CLI to its launcher.' >&2; exit 1;
      }
      export PURGE_DSH_CLI
      PURGE_INSTALL_MODE=web
    fi ;;
  *) echo 'Supported: Linux/macOS. Use scripts/install.ps1 on Windows.' >&2; exit 1 ;;
esac
[ -n "$RUNTIME" ] && [ -x "$RUNTIME" ] && [ -f "$RUNTIME" ] || {
  echo 'Runtime not found. Linux CLI: set DSH_NODE; Desktop: set DSH_APP to the executable (.app on macOS).' >&2; exit 1;
}
export PURGE_INSTALL_MODE
# A checkout uses the reviewed sibling bootstrap, including for offline installs.
BOOTSTRAP="$(dirname "$0")/bootstrap-install.mjs"
if [ -f "$BOOTSTRAP" ]; then
  if [ -n "${PURGE_VERSION:-}" ]; then set -- "--version=$PURGE_VERSION" "$@"; fi
  ELECTRON_RUN_AS_NODE=1 "$RUNTIME" "$BOOTSTRAP" "$@"
  exit $?
fi
TMP=$(mktemp -d "${TMPDIR:-/tmp}/purge-bootstrap.XXXXXX")
trap 'rm -rf "$TMP"' 0
trap 'exit 130' INT
trap 'exit 143' TERM
curl -fsSL --connect-timeout 20 --max-time 90 https://raw.githubusercontent.com/kingcharleslzy-ai/dsh-purge/master/scripts/bootstrap-install.mjs -o "$TMP/bootstrap-install.mjs"
if [ -n "${PURGE_VERSION:-}" ]; then set -- "--version=$PURGE_VERSION" "$@"; fi
ELECTRON_RUN_AS_NODE=1 "$RUNTIME" "$TMP/bootstrap-install.mjs" "$@"
