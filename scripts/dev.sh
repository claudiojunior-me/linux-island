#!/usr/bin/env bash
# ABOUTME: Installs the extension and starts a nested GNOME Shell that loads the fresh code.
# ABOUTME: Run it again after each change; closing the nested window ends the session.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$ROOT/scripts/install.sh"

MAJOR="$(gnome-shell --version | grep -oE '[0-9]+' | head -n1)"
if [ "$MAJOR" -ge 49 ]; then
  exec dbus-run-session gnome-shell --devkit
else
  exec dbus-run-session gnome-shell --nested --wayland
fi
