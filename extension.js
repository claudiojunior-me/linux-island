// ABOUTME: GNOME Shell entry point: loads the enabled plugins, draws the island and publishes the D-Bus control API.
// ABOUTME: Everything created in enable() is torn down in disable(), as GNOME Shell requires.
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {IslandControl} from './src/core/island-control.js';
import {PluginLoader} from './src/core/plugin-loader.js';
import {PluginRegistry} from './src/core/plugin-registry.js';
import {PLUGIN_FACTORIES} from './src/plugins/catalog.js';
import {ENABLED_PLUGINS_SETTING, PLUGIN_MANIFEST} from './src/plugins/manifest.js';
import {ControlBus} from './src/shell/control-bus.js';
import {Island} from './src/shell/island.js';

export default class LinuxIslandExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._registry = new PluginRegistry();
        this._shells = new Map();
        const openSettings = () => this.openPreferences();

        this._island = new Island(this._registry, this._shells, {openSettings});
        this._loader = new PluginLoader({
            registry: this._registry,
            shells: this._shells,
            order: PLUGIN_MANIFEST.map(entry => entry.id),
            factories: PLUGIN_FACTORIES,
            context: {settings: this._settings},
        });
        const applyEnabled = () => this._loader.apply(this._settings.get_strv(ENABLED_PLUGINS_SETTING));
        this._enabledChangedId = this._settings.connect(`changed::${ENABLED_PLUGINS_SETTING}`, applyEnabled);
        applyEnabled();

        this._controlBus = new ControlBus(new IslandControl(this._registry, {openSettings}));
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._registry.list().forEach(plugin => plugin.tick?.());
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        GLib.source_remove(this._tickId);
        this._settings.disconnect(this._enabledChangedId);
        this._controlBus.destroy();
        this._loader.unloadAll();
        this._island.destroy();
        this._tickId = null;
        this._enabledChangedId = null;
        this._controlBus = null;
        this._loader = null;
        this._island = null;
        this._shells = null;
        this._registry = null;
        this._settings = null;
    }
}
