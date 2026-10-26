// ABOUTME: Keeps the island's plugins and picks which one the island shows.
// ABOUTME: Plugins need an id, a numeric priority, hasActivity() and handleAction(action).
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

    // The active plugin with the highest priority; the first registered one when none is active.
    foreground() {
        const plugins = this.list();
        const active = plugins.filter(plugin => plugin.hasActivity());
        if (active.length === 0)
            return plugins[0] ?? null;
        return active.reduce((best, plugin) => plugin.priority > best.priority ? plugin : best);
    }

    dispatch(id, action) {
        const plugin = this._plugins.get(id);
        if (!plugin)
            throw new Error(`unknown plugin: ${id}`);
        plugin.handleAction(action);
    }

    subscribe(listener) {
        return this._listeners.add(listener);
    }

    _notify() {
        this._listeners.emit();
    }
}
