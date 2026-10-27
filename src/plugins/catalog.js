// ABOUTME: Lists the plugins the island loads, pairing each plugin with its GNOME Shell part.
// ABOUTME: Add an entry here to ship a new plugin; createShell(plugin, {settings}) gets the extension settings.
import {LiveActivitiesPlugin} from './activities/plugin.js';
import {createActivitiesShell} from './activities/shell.js';
import {PomodoroPlugin} from './pomodoro/plugin.js';
import {createPomodoroShell} from './pomodoro/shell.js';
import {PrivacyPlugin} from './privacy/plugin.js';
import {createPrivacyShell} from './privacy/shell.js';
import {TodoistPlugin} from './todoist/plugin.js';
import {createTodoistShell} from './todoist/shell.js';

export const PLUGIN_CATALOG = [
    {create: () => new PomodoroPlugin(), createShell: createPomodoroShell},
    {create: () => new LiveActivitiesPlugin(), createShell: createActivitiesShell},
    {create: () => new PrivacyPlugin(), createShell: createPrivacyShell},
    {create: () => new TodoistPlugin(), createShell: createTodoistShell},
];
