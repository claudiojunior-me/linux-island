// ABOUTME: Keeps the island's plugins and picks which ones the island shows.
// ABOUTME: Plugins need id, numeric priority, hasActivity(), handleAction(action, payload); showsWhenIdle is optional.
import {Listeners} from './listeners.js';

export class PluginRegistry {
    constructor() {
        this._plugins = new Map();
        this._listeners = new Listeners();
    }

    register(plugin) {
        if (this._plugins.has(plugin.id))
            throw new Error(`plugin already registered: ${plugin.id}`);
        this._plugins.set(plugin.id, plugin);
        this._notify();
    }

    unregister(id) {
        if (this._plugins.delete(id))
            this._notify();
    }

    get(id) {
        return this._plugins.get(id);
    }

    list() {
        return [...this._plugins.values()];
    }

    // Active plugins by priority (ties keep registration order), then idle plugins that show when idle.
    visible(limit) {
        const plugins = this.list();
        const active = plugins.filter(plugin => plugin.hasActivity())
            .sort((a, b) => b.priority - a.priority);
        const idle = plugins.filter(plugin => plugin.showsWhenIdle && !active.includes(plugin));
        return [...active, ...idle].slice(0, limit);
    }

    foreground() {
        return this.visible(1)[0] ?? null;
    }

    dispatch(id, action, payload) {
        const plugin = this._plugins.get(id);
        if (!plugin)
            throw new Error(`unknown plugin: ${id}`);
        plugin.handleAction(action, payload);
    }

    subscribe(listener) {
        return this._listeners.add(listener);
    }

    _notify() {
        this._listeners.emit();
    }
}
