// ABOUTME: Lists the plugins the island loads, pairing each plugin with its GNOME Shell part.
// ABOUTME: Add an entry here to ship a new plugin; createShell(plugin, {settings}) gets the extension settings.
import {PomodoroPlugin} from './pomodoro/plugin.js';
import {createPomodoroShell} from './pomodoro/shell.js';

export const PLUGIN_CATALOG = [
    {create: () => new PomodoroPlugin(), createShell: createPomodoroShell},
];
