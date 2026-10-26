#!/usr/bin/env bash
# ABOUTME: Runs the end-to-end suite against a real headless GNOME Shell with the extension installed.
# ABOUTME: Uses throwaway XDG dirs and a private session bus, so the user's own settings are untouched.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UUID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$ROOT/metadata.json")"

for tool in gnome-shell gdbus dbus-run-session node; do
    command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT
export HOME="$SANDBOX/home"
export XDG_CONFIG_HOME="$SANDBOX/config"
export XDG_DATA_HOME="$SANDBOX/data"
export XDG_CACHE_HOME="$SANDBOX/cache"
export XDG_STATE_HOME="$SANDBOX/state"
export XDG_RUNTIME_DIR="$SANDBOX/runtime"
# Keeps gvfs from mounting a FUSE filesystem inside the sandbox, which would block its cleanup.
export GIO_USE_VFS=local
export GVFS_DISABLE_FUSE=1
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

"$ROOT/scripts/install.sh" >/dev/null

export E2E_SCREENSHOT_DIR="$ROOT/tests/e2e/output"
mkdir -p "$E2E_SCREENSHOT_DIR"

dbus-run-session -- bash -c '
    set -euo pipefail
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell disable-extension-version-validation true
    gsettings set org.gnome.shell enabled-extensions "[\"$1\"]"

    gnome-shell --headless --unsafe-mode --virtual-monitor 1280x800 >"$XDG_STATE_HOME/gnome-shell.log" 2>&1 &
    SHELL_PID=$!
    trap "kill $SHELL_PID 2>/dev/null || true" EXIT

    status=0
    node --test "$2/tests/e2e/*.e2e.test.js" || status=$?
    if [ "$status" -ne 0 ]; then
        echo "---- gnome-shell log ----" >&2
        cat "$XDG_STATE_HOME/gnome-shell.log" >&2
    fi
    exit "$status"
' _ "$UUID" "$ROOT"
