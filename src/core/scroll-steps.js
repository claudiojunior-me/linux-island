// ABOUTME: Turns scroll deltas into whole steps: a wheel notch is one step, touchpad deltas add up to one.
// ABOUTME: Each step starts gathering over, so one long swipe does not race through many cards.

export class ScrollSteps {
    constructor() {
        this._gathered = 0;
    }

    // Returns -1, 0 or 1.
    add(delta) {
        if (Math.sign(delta) !== Math.sign(this._gathered))
            this._gathered = 0;
        this._gathered += delta;
        if (Math.abs(this._gathered) < 1)
            return 0;
        const step = Math.sign(this._gathered);
        this._gathered = 0;
        return step;
    }
}
