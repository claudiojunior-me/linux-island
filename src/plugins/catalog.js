// ABOUTME: Pairs each plugin id from the manifest with its plugin and GNOME Shell part.
// ABOUTME: Add an entry here and in manifest.js to ship a new plugin; createShell gets {settings}.
import {LiveActivitiesPlugin} from './activities/plugin.js';
import {createActivitiesShell} from './activities/shell.js';
import {PomodoroPlugin} from './pomodoro/plugin.js';
import {createPomodoroShell} from './pomodoro/shell.js';
import {PrivacyPlugin} from './privacy/plugin.js';
import {createPrivacyShell} from './privacy/shell.js';
import {TodoistPlugin} from './todoist/plugin.js';
import {createTodoistShell} from './todoist/shell.js';

export const PLUGIN_FACTORIES = {
    pomodoro: {create: () => new PomodoroPlugin(), createShell: createPomodoroShell},
    activities: {create: () => new LiveActivitiesPlugin(), createShell: createActivitiesShell},
    privacy: {create: () => new PrivacyPlugin(), createShell: createPrivacyShell},
    todoist: {create: () => new TodoistPlugin(), createShell: createTodoistShell},
};
