// ABOUTME: Control surface for driving island plugins from outside the shell.
// ABOUTME: Method names match the D-Bus interface so it can be exported as-is.

export class IslandControl {
    // openSettings opens the preferences window; the shell provides it.
    constructor(registry, {openSettings = null} = {}) {
        this._registry = registry;
        this._openSettings = openSettings;
    }

    OpenSettings() {
        if (!this._openSettings)
            throw new Error('settings window is not available');
        this._openSettings();
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

    // Like Activate, with a JSON object of action data, e.g. the fields of a live activity.
    Send(pluginId, action, payloadJson) {
        let payload;
        try {
            payload = JSON.parse(payloadJson);
        } catch {
            payload = null;
        }
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload))
            throw new Error(`payload must be a JSON object, got: ${payloadJson}`);
        this._registry.dispatch(pluginId, action, payload);
    }
}
