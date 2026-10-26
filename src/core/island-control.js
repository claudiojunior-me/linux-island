// ABOUTME: Control surface for driving island plugins from outside the shell.
// ABOUTME: Method names match the D-Bus interface so it can be exported as-is.

export class IslandControl {
    constructor(registry) {
        this._registry = registry;
    }

    ListPlugins() {
        return this._registry.list().map(plugin => plugin.id);
    }

    GetForeground() {
        return this._registry.foreground()?.id ?? '';
    }

    GetState(pluginId) {
        const plugin = this._registry.get(pluginId);
        if (!plugin)
            throw new Error(`unknown plugin: ${pluginId}`);
        return JSON.stringify(plugin.getState());
    }

    Activate(pluginId, action) {
        this._registry.dispatch(pluginId, action);
    }
}
