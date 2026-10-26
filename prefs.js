// ABOUTME: Preferences window for Linux Island, opened from the Extensions app or gnome-extensions prefs.
// ABOUTME: Rows take their titles and limits from the settings schema, so the schema stays the single source.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {POMODORO_SETTING_KEYS} from './src/plugins/pomodoro/settings.js';
import {TODOIST_TOKEN_SETTING} from './src/plugins/todoist/settings.js';

function spinRowForKey(settings, key) {
    const schemaKey = settings.settings_schema.get_key(key);
    const [, limits] = schemaKey.get_range().deepUnpack();
    const [min, max] = limits.deepUnpack();
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = schemaKey.get_summary();
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

// The token is saved on apply, not per keystroke, so half-typed tokens never reach Todoist.
function todoistGroup(settings) {
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
    return group;
}

export default class LinuxIslandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const pomodoro = new Adw.PreferencesGroup({
            title: 'Pomodoro',
            description: 'A phase already in progress keeps its length; changes apply from the next one.',
        });
        for (const key of Object.values(POMODORO_SETTING_KEYS))
            pomodoro.add(spinRowForKey(settings, key));
        page.add(pomodoro);
        page.add(todoistGroup(settings));
        window.add(page);
    }
}
