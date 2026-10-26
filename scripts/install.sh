#!/usr/bin/env bash
# ABOUTME: Copies the extension files into the user's GNOME Shell extensions directory.
# ABOUTME: Honors XDG_DATA_HOME so tests can install into a throwaway directory.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$ROOT/metadata.json")"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -r "$ROOT/metadata.json" "$ROOT/extension.js" "$ROOT/stylesheet.css" "$ROOT/src" "$TARGET/"
echo "Installed $UUID into $TARGET"
