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
# No accessibility bus in the sandbox; stops the shell from looking for one.
export NO_AT_BRIDGE=1
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

"$ROOT/scripts/install.sh" >/dev/null

export E2E_SCHEMA_DIR="$XDG_DATA_HOME/gnome-shell/extensions/$UUID/schemas"
export E2E_SCREENSHOT_DIR="$ROOT/tests/e2e/output"
mkdir -p "$E2E_SCREENSHOT_DIR"

# Private session bus that can only start dconf, so desktop services (tracker, evolution,
# document portal) stay down: no noise in the output and no FUSE mounts left in the sandbox.
mkdir -p "$SANDBOX/dbus-services"
cp /usr/share/dbus-1/services/ca.desrt.dconf.service "$SANDBOX/dbus-services/"
cat >"$SANDBOX/session-bus.conf" <<CONF
<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>session</type>
  <listen>unix:tmpdir=/tmp</listen>
  <auth>EXTERNAL</auth>
  <servicedir>$SANDBOX/dbus-services</servicedir>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
CONF

SESSION_LOG="$SANDBOX/session.log"
SHELL_LOG="$SANDBOX/gnome-shell.log"
status=0
dbus-run-session --config-file="$SANDBOX/session-bus.conf" -- bash -c '
    set -euo pipefail
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell disable-extension-version-validation true
    gsettings set org.gnome.shell enabled-extensions "[\"$1\"]"

    gnome-shell --headless --unsafe-mode --virtual-monitor 1280x800 >"$3" 2>&1 &
    SHELL_PID=$!
    trap "kill $SHELL_PID 2>/dev/null || true" EXIT

    node --test "$2/tests/e2e/*.e2e.test.js"
' _ "$UUID" "$ROOT" "$SHELL_LOG" 2>"$SESSION_LOG" || status=$?

# Bus activation messages land in the session log; it is only worth reading when something failed.
if [ "$status" -ne 0 ]; then
    echo "---- session log ----" >&2
    cat "$SESSION_LOG" >&2
    echo "---- gnome-shell log ----" >&2
    cat "$SHELL_LOG" >&2
fi
exit "$status"
