// ABOUTME: GNOME Shell entry point: loads plugins, draws the island and publishes the D-Bus control API.
// ABOUTME: Everything created in enable() is torn down in disable(), as GNOME Shell requires.
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {IslandControl} from './src/core/island-control.js';
import {PluginRegistry} from './src/core/plugin-registry.js';
import {PLUGIN_CATALOG} from './src/plugins/catalog.js';
import {ControlBus} from './src/shell/control-bus.js';
import {Island} from './src/shell/island.js';

export default class LinuxIslandExtension extends Extension {
    enable() {
        this._registry = new PluginRegistry();
        this._shells = new Map();
        for (const entry of PLUGIN_CATALOG) {
            const plugin = entry.create();
            this._registry.register(plugin);
            this._shells.set(plugin.id, entry.createShell(plugin));
        }

        this._island = new Island(this._registry, this._shells);
        this._controlBus = new ControlBus(new IslandControl(this._registry));
        this._tickId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._registry.list().forEach(plugin => plugin.tick?.());
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        GLib.source_remove(this._tickId);
        this._controlBus.destroy();
        this._island.destroy();
        this._shells.forEach(shell => shell.destroy());
        this._registry.list().forEach(plugin => plugin.destroy());
        this._tickId = null;
        this._controlBus = null;
        this._island = null;
        this._shells = null;
        this._registry = null;
    }
}
