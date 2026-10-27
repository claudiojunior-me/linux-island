# Linux Island

A Dynamic Island for GNOME on Ubuntu and Debian. A black pill sits centered below the top bar and shows whatever plugin has something going on; a second plugin can run beside it in a small bubble. Click either one to expand it and reveal controls.

Plugins:

- **Pomodoro**: focus and break timer with configurable durations.
- **Live activities**: cards any script can push, e.g. build progress or "waiting for you".
- **Claude Code status**: one card per Claude Code session: working, waiting for you, finished.

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
- Durations live in the preferences window: `gnome-extensions prefs linux-island@claudiojunior-me.github.io`. A phase already in progress keeps its length; changes apply from the next phase.

### Command line

`bin/island` drives the island from scripts and keybindings. Link it somewhere on your `PATH`:

```sh
ln -s "$PWD/bin/island" ~/.local/bin/island

island list
island state pomodoro
island pomodoro toggle            # also: start, pause, skip, reset
```

Bind `island pomodoro toggle` to a custom shortcut in Settings > Keyboard to start and pause focus without the mouse.

### Live activities

```sh
island activities push --id build --title "cargo build" --subtitle compiling --progress 0.4
island activities push --id build --title "cargo build" --accent success --timeout-seconds 10
island activities end --id build
island activities clear
```

| Option | Meaning |
| --- | --- |
| `--id` | Required. Pushing the same id updates the card |
| `--title` | Required |
| `--subtitle` | Secondary line |
| `--progress` | 0 to 1; shows a bar |
| `--icon` | Symbolic icon name, e.g. `emblem-ok-symbolic` |
| `--accent` | `normal`, `attention`, `success` or `error` |
| `--timeout-seconds` | Ends the card by itself |

Activities take the island over the pomodoro while they exist. `attention` cards come first, then the most recently pushed. Click to expand and see every card; each has a dismiss button.

### Claude Code status

```sh
scripts/install-claude-code-hooks.js              # adds hooks to ~/.claude/settings.json
scripts/install-claude-code-hooks.js --uninstall  # removes only those hooks
```

The installer keeps your other hooks, honors `CLAUDE_CONFIG_DIR`, and saves the previous file as `settings.json.linux-island-backup`. It points the hooks at this checkout, so re-run it if you move the repository.

| Claude Code event | Card |
| --- | --- |
| `UserPromptSubmit` | `Claude · <project>`, "Working…" |
| `Notification` | Claude's message (permission, waiting for input), `attention` accent, jumps to the front |
| `Stop` | "Finished, your turn", `success` accent, ends after 2 minutes |
| `SessionEnd` | Card removed |

Only sessions running on the same desktop session as the island can reach it.

### D-Bus API

The CLI is a thin client over `io.github.claudiojunior_me.LinuxIsland` at `/io/github/claudiojunior_me/LinuxIsland`:

| Method | Signature |
| --- | --- |
| `ListPlugins` | `() -> as` |
| `GetForeground` | `() -> s` |
| `GetState` | `(s pluginId) -> s stateJson` |
| `Activate` | `(s pluginId, s action)` |
| `Send` | `(s pluginId, s action, s payloadJson)` |

## Architecture

```
extension.js                 GNOME Shell entry point (enable/disable)
src/core/                    Pure JavaScript, no GNOME imports, runs in Node tests
  plugin-registry.js         Holds plugins, picks the foreground one, dispatches actions
  island-control.js          Control API, exported as-is over D-Bus
  bus-address.js             Bus name and object path of that API
  listeners.js               Change notification helper
  clock-format.js            MM:SS countdown text
bin/island                   Command line client
bin/claude-code-hook         Claude Code hook that feeds live activities
scripts/                     Installers for the extension and the Claude Code hooks
src/cli/                     Command line parsing and the gdbus client
src/integrations/claude-code/  Hook event mapping and settings.json editing (pure)
src/shell/                   GNOME Shell only
  box.js                     Vertical box that works on every supported shell version
  island.js                  Pill and bubble: positioning, expand/collapse, resize animation
  control-bus.js             Publishes IslandControl on the session bus
  progress-bar.js            Progress bar shared by plugin views
prefs.js                     Preferences window, driven by the settings schema
schemas/                     GSettings schema
src/plugins/
  catalog.js                 Plugins the island loads
  activities/plugin.js       Live activities (pure)
  activities/shell.js        Live activity views
  pomodoro/timer.js          Pomodoro state machine (pure)
  pomodoro/plugin.js         Plugin contract implementation (pure)
  pomodoro/settings.js       Settings keys for the pomodoro durations
  pomodoro/shell.js          Pomodoro views and alerts (GNOME Shell)
```

Each plugin is split in two: a pure part that holds behaviour and state, and a shell part that draws it. The pure part is what the tests exercise and what the D-Bus API talks to.

### What the island shows

Up to two plugins: active plugins ordered by `priority`, then plugins with `showsWhenIdle` in catalog order. The first goes in the pill, the second in the bubble. Clicking the pill expands its plugin; clicking the bubble expands the bubble's plugin inside the pill until you click the pill again.

### Writing a plugin

Pure part (`src/plugins/<name>/plugin.js`):

| Member | Purpose |
| --- | --- |
| `id`, `title`, `priority` | Identity and ranking on the island |
| `showsWhenIdle` | `true` to stay on the island without activity, e.g. the pomodoro start button |
| `hasActivity()` | `true` when the plugin wants the island |
| `handleAction(action, payload)` | Reacts to buttons, D-Bus `Activate` and `Send` (payload is the parsed JSON object); throws on unknown actions |
| `getState()` | JSON-serializable state for views and D-Bus `GetState` |
| `subscribe(listener)` | Emits `{type: 'changed'}` and plugin-specific events; returns an unsubscribe function |
| `tick()` | Optional, called once a second |
| `destroy()` | Releases resources |

Shell part (`src/plugins/<name>/shell.js`) exports a factory `(plugin, {settings})` returning `{compact, expanded, minimal, update(state), destroy()}`. `compact` and `expanded` go in the pill, `minimal` in the bubble; all three are St actors.

Register both in `src/plugins/catalog.js`.

## Tests

```sh
npm test            # unit + integration, runs anywhere with Node
npm run test:e2e    # needs gnome-shell installed; starts a headless shell
```

The end-to-end suite runs GNOME Shell headless with throwaway `XDG_*` directories and a private session bus, installs the extension there, drives it over D-Bus and checks the actor on screen. It leaves a screenshot in `tests/e2e/output/island-running.png`.

## License

MIT
