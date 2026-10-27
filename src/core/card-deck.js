// ABOUTME: Treats every loaded plugin as a card the user can page through, in a fixed order.
// ABOUTME: A chosen card stays in front until a plugin with higher priority becomes active.

export class CardDeck {
    // order lists plugin ids in the order the cards are paged through.
    constructor(registry, order) {
        this._registry = registry;
        this._order = order;
        this._chosenId = null;
        this._activeIds = new Set();
    }

    cards() {
        return this._order.map(id => this._registry.get(id)).filter(Boolean);
    }

    // The card in front: the one the user chose, or the registry's foreground plugin.
    current() {
        return (this._chosenId !== null && this._registry.get(this._chosenId)) || this._registry.foreground();
    }

    // The most important visible plugin other than the current card.
    runnerUp() {
        const current = this.current();
        return this._registry.visible(this._registry.list().length).find(plugin => plugin !== current) ?? null;
    }

    choose(id) {
        this._chosenId = id;
        this._activeIds = this._activeNow();
    }

    next() {
        this._step(1);
    }

    previous() {
        this._step(-1);
    }

    // Call after plugins change: drops the choice when its plugin is gone or a higher-priority plugin became active.
    refresh() {
        const active = this._activeNow();
        const chosen = this._chosenId !== null ? this._registry.get(this._chosenId) : null;
        const takenOver = chosen && [...active].some(id =>
            !this._activeIds.has(id) && this._registry.get(id).priority > chosen.priority);
        if (!chosen || takenOver)
            this._chosenId = null;
        this._activeIds = active;
    }

    _step(delta) {
        const cards = this.cards();
        if (cards.length === 0)
            return;
        const index = cards.indexOf(this.current());
        const target = index === -1
            ? cards[0]
            : cards[(index + delta + cards.length) % cards.length];
        this.choose(target.id);
    }

    _activeNow() {
        return new Set(this._registry.list().filter(plugin => plugin.hasActivity()).map(plugin => plugin.id));
    }
}
