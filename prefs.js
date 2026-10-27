// ABOUTME: Linux Island settings window with one page per area: mini-apps, pomodoro, Todoist.
// ABOUTME: Opens from the island's gear button, `island settings`, the app grid or the Extensions app.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {IN_TOP_BAR_SETTING} from './src/core/island-settings.js';
import {ENABLED_PLUGINS_SETTING, PLUGIN_MANIFEST} from './src/plugins/manifest.js';
import {POMODORO_SETTING_KEYS} from './src/plugins/pomodoro/settings.js';
import {TODOIST_TOKEN_SETTING} from './src/plugins/todoist/settings.js';

// Where the island sits on screen.
function placementGroup(settings) {
    const group = new Adw.PreferencesGroup({title: 'Island'});
    const schemaKey = settings.settings_schema.get_key(IN_TOP_BAR_SETTING);
    const row = new Adw.SwitchRow({title: schemaKey.get_summary(), subtitle: schemaKey.get_description()});
    settings.bind(IN_TOP_BAR_SETTING, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(row);
    return group;
}

// One switch per shipped plugin; the setting keeps manifest order so the island's order stays stable.
function miniAppsPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Mini-apps', icon_name: 'view-grid-symbolic'});
    page.add(placementGroup(settings));
    const group = new Adw.PreferencesGroup({
        title: 'Mini-apps',
        description: 'A disabled mini-app is unloaded: it stops watching, polling and answering on D-Bus.',
    });
    for (const entry of PLUGIN_MANIFEST) {
        const row = new Adw.SwitchRow({
            title: entry.title,
            subtitle: entry.description,
            active: settings.get_strv(ENABLED_PLUGINS_SETTING).includes(entry.id),
        });
        row.connect('notify::active', () => {
            const enabled = new Set(settings.get_strv(ENABLED_PLUGINS_SETTING));
            if (row.active)
                enabled.add(entry.id);
            else
                enabled.delete(entry.id);
            settings.set_strv(ENABLED_PLUGINS_SETTING,
                PLUGIN_MANIFEST.map(candidate => candidate.id).filter(id => enabled.has(id)));
        });
        group.add(row);
    }
    page.add(group);
    return page;
}

function spinRowForKey(settings, key) {
    const schemaKey = settings.settings_schema.get_key(key);
    const [, limits] = schemaKey.get_range().deepUnpack();
    const [min, max] = limits.deepUnpack();
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = schemaKey.get_summary();
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function pomodoroPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Pomodoro', icon_name: 'alarm-symbolic'});
    const group = new Adw.PreferencesGroup({
        title: 'Durations',
        description: 'A phase already in progress keeps its length; changes apply from the next one.',
    });
    for (const key of Object.values(POMODORO_SETTING_KEYS))
        group.add(spinRowForKey(settings, key));
    page.add(group);
    return page;
}

// The token is saved on apply, not per keystroke, so half-typed tokens never reach Todoist.
function todoistPage(settings) {
    const page = new Adw.PreferencesPage({title: 'Todoist', icon_name: 'checkbox-checked-symbolic'});
    const group = new Adw.PreferencesGroup({
        title: 'Todoist',
        description: 'Personal API token from Todoist: Settings, Integrations, Developer. Stored in dconf as plain text.',
    });
    const tokenRow = new Adw.PasswordEntryRow({
        title: settings.settings_schema.get_key(TODOIST_TOKEN_SETTING).get_summary(),
        text: settings.get_string(TODOIST_TOKEN_SETTING),
        show_apply_button: true,
    });
    tokenRow.connect('apply', () => settings.set_string(TODOIST_TOKEN_SETTING, tokenRow.text.trim()));
    group.add(tokenRow);
    page.add(group);
    return page;
}

export default class LinuxIslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.add(miniAppsPage(settings));
        window.add(pomodoroPage(settings));
        window.add(todoistPage(settings));
    }
}
