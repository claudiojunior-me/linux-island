# Linux Island

A Dynamic Island for GNOME on Ubuntu and Debian. A black pill sits centered below the top bar, shows whatever plugin has something going on, and expands on click to reveal controls.

The first plugin is a pomodoro timer.

## Requirements

- GNOME Shell 46 to 50 (Ubuntu 24.04+, Debian 13+)
- Node.js 20+ (only to run the tests)

## Install

```sh
scripts/install.sh
gnome-extensions enable linux-island@claudiojunior-me.github.io
```

On Wayland, GNOME Shell only picks up a newly installed extension after you log out and back in. After that, re-running `scripts/install.sh` followed by `gnome-extensions disable`/`enable` is enough for most changes.

To try it without touching your session, run a nested shell:

```sh
# GNOME 49 and later
dbus-run-session gnome-shell --devkit
# GNOME 46 to 48
dbus-run-session gnome-shell --nested --wayland
```

## Usage

- Click the pill to expand or collapse it.
- Expanded pomodoro: reset, start/pause, skip phase.
- A notification and sound mark the end of each phase. Phases do not auto-start; press start when ready.

### Control from scripts and keybindings

The island publishes a D-Bus API on the session bus:

```sh
DEST=io.github.claudiojunior_me.LinuxIsland
OBJ=/io/github/claudiojunior_me/LinuxIsland

gdbus call --session --dest $DEST --object-path $OBJ --method $DEST.ListPlugins
gdbus call --session --dest $DEST --object-path $OBJ --method $DEST.Activate pomodoro toggle
gdbus call --session --dest $DEST --object-path $OBJ --method $DEST.GetState pomodoro
```

Pomodoro actions: `toggle`, `start`, `pause`, `skip`, `reset`.

Bind the `Activate ... toggle` command to a custom shortcut in Settings > Keyboard to start and pause focus without the mouse.

## Architecture

```
extension.js                 GNOME Shell entry point (enable/disable)
src/core/                    Pure JavaScript, no GNOME imports, runs in Node tests
  plugin-registry.js         Holds plugins, picks the foreground one, dispatches actions
  island-control.js          Control API, exported as-is over D-Bus
  listeners.js               Change notification helper
  clock-format.js            MM:SS countdown text
src/shell/                   GNOME Shell only
  box.js                     Vertical box that works on every supported shell version
  island.js                  The pill: positioning, compact/expanded switch, resize animation
  control-bus.js             Publishes IslandControl on the session bus
src/plugins/
  catalog.js                 Plugins the island loads
  pomodoro/timer.js          Pomodoro state machine (pure)
  pomodoro/plugin.js         Plugin contract implementation (pure)
  pomodoro/shell.js          Pomodoro views and alerts (GNOME Shell)
```

Each plugin is split in two: a pure part that holds behaviour and state, and a shell part that draws it. The pure part is what the tests exercise and what the D-Bus API talks to.

### Foreground rule

The island shows the plugin with activity and the highest `priority`. When nothing is active, it shows the first plugin in the catalog.

### Writing a plugin

Pure part (`src/plugins/<name>/plugin.js`):

| Member | Purpose |
| --- | --- |
| `id`, `title`, `priority` | Identity and foreground ranking |
| `hasActivity()` | `true` when the plugin wants the island |
| `handleAction(action)` | Reacts to buttons and D-Bus `Activate`; throws on unknown actions |
| `getState()` | JSON-serializable state for views and D-Bus `GetState` |
| `subscribe(listener)` | Emits `{type: 'changed'}` and plugin-specific events; returns an unsubscribe function |
| `tick()` | Optional, called once a second |
| `destroy()` | Releases resources |

Shell part (`src/plugins/<name>/shell.js`) exports a factory returning `{compact, expanded, update(state), destroy()}`, where `compact` and `expanded` are St actors.

Register both in `src/plugins/catalog.js`.

## Tests

```sh
npm test            # unit + integration, runs anywhere with Node
npm run test:e2e    # needs gnome-shell installed; starts a headless shell
```

The end-to-end suite runs GNOME Shell headless with throwaway `XDG_*` directories and a private session bus, installs the extension there, drives it over D-Bus and checks the actor on screen. It leaves a screenshot in `tests/e2e/output/island-running.png`.

## License

MIT
