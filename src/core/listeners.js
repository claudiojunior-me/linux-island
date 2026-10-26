// ABOUTME: Minimal listener set for change notifications between island parts.
// ABOUTME: add() returns a function that removes the listener again.

export class Listeners {
    constructor() {
        this._listeners = new Set();
    }

    add(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    emit(...args) {
        for (const listener of [...this._listeners])
            listener(...args);
    }

    clear() {
        this._listeners.clear();
    }
}
