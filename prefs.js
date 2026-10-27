// ABOUTME: Preferences window for Linux Island, opened from the Extensions app or gnome-extensions prefs.
// ABOUTME: Rows take their titles and limits from the settings schema, so the schema stays the single source.
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {POMODORO_SETTING_KEYS} from './src/plugins/pomodoro/settings.js';

function spinRowForKey(settings, key) {
    const schemaKey = settings.settings_schema.get_key(key);
    const [, limits] = schemaKey.get_range().deepUnpack();
    const [min, max] = limits.deepUnpack();
    const row = Adw.SpinRow.new_with_range(min, max, 1);
    row.title = schemaKey.get_summary();
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
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
        window.add(page);
    }
}
