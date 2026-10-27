// ABOUTME: Loads and unloads plugins, with their shell parts, so the registry matches the enabled list.
// ABOUTME: Unloading unregisters first, letting the island let go of the views before they are destroyed.

export class PluginLoader {
    // factories maps a plugin id to {create(), createShell(plugin, context)}; order is the manifest order.
    constructor({registry, shells, order, factories, context}) {
        this._registry = registry;
        this._shells = shells;
        this._order = order;
        this._factories = factories;
        this._context = context;
    }

    apply(enabledIds) {
        for (const id of this._order) {
            const loaded = this._shells.has(id);
            const enabled = enabledIds.includes(id) && id in this._factories;
            if (enabled && !loaded)
                this._load(id);
            else if (!enabled && loaded)
                this._unload(id);
        }
    }

    unloadAll() {
        for (const id of this._order) {
            if (this._shells.has(id))
                this._unload(id);
        }
    }

    _load(id) {
        const factory = this._factories[id];
        const plugin = factory.create();
        this._shells.set(id, factory.createShell(plugin, this._context));
        this._registry.register(plugin);
    }

    _unload(id) {
        const plugin = this._registry.get(id);
        const shell = this._shells.get(id);
        this._registry.unregister(id);
        this._shells.delete(id);
        shell.destroy();
        plugin.destroy();
    }
}
