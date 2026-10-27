#!/usr/bin/env bash
# ABOUTME: Copies the extension files into the user's GNOME Shell extensions directory.
# ABOUTME: Honors XDG_DATA_HOME so tests can install into a throwaway directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$ROOT/metadata.json")"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -r "$ROOT/metadata.json" "$ROOT/extension.js" "$ROOT/prefs.js" "$ROOT/stylesheet.css" "$ROOT/src" "$ROOT/schemas" "$TARGET/"
glib-compile-schemas "$TARGET/schemas"

# App grid entry that opens the settings window.
APPLICATIONS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$APPLICATIONS"
cat >"$APPLICATIONS/linux-island-settings.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Linux Island
Comment=Settings for the Linux Island mini-apps
Exec=gnome-extensions prefs $UUID
Icon=emblem-system-symbolic
Categories=Settings;GNOME;
Keywords=island;pomodoro;todoist;
DESKTOP
echo "Installed $UUID into $TARGET"
