// ABOUTME: Pomodoro island plugin: turns actions and clock ticks into timer changes and events.
// ABOUTME: Holds no UI, so the shell view and tests share the same behaviour.
import {formatCountdown} from '../../core/clock-format.js';
import {Listeners} from '../../core/listeners.js';
import {PomodoroTimer} from './timer.js';

export class PomodoroPlugin {
    constructor({clock = () => Date.now(), timerOptions = {}} = {}) {
        this.id = 'pomodoro';
        this.title = 'Pomodoro';
        this.priority = 10;
        this._clock = clock;
        this._timer = new PomodoroTimer(timerOptions);
        this._listeners = new Listeners();
    }

    hasActivity() {
        const {running, remainingMs, totalMs} = this._timer.snapshot(this._clock());
        return running || remainingMs < totalMs;
    }

    handleAction(action) {
        const now = this._clock();
        switch (action) {
        case 'toggle':
            if (this._timer.snapshot(now).running)
                this._timer.pause(now);
            else
                this._timer.start(now);
            break;
        case 'start':
            this._timer.start(now);
            break;
        case 'pause':
            this._timer.pause(now);
            break;
        case 'skip':
            this._timer.skip();
            break;
        case 'reset':
            this._timer.reset();
            break;
        default:
            throw new Error(`unknown pomodoro action: ${action}`);
        }
        this._listeners.emit({type: 'changed'});
    }

    configure(timerOptions) {
        this._timer.configure(timerOptions);
        this._listeners.emit({type: 'changed'});
    }

    // Called by the host about once a second while the plugin is loaded.
    tick() {
        const now = this._clock();
        const finished = this._timer.tick(now);
        if (finished) {
            const next = this._timer.snapshot(now).phase;
            this._listeners.emit({type: 'phase-finished', phase: finished, next});
            this._listeners.emit({type: 'changed'});
        } else if (this._timer.snapshot(now).running) {
            this._listeners.emit({type: 'changed'});
        }
    }

    getState() {
        const snapshot = this._timer.snapshot(this._clock());
        return {
            ...snapshot,
            countdown: formatCountdown(snapshot.remainingMs),
            progress: (snapshot.totalMs - snapshot.remainingMs) / snapshot.totalMs,
        };
    }

    subscribe(listener) {
        return this._listeners.add(listener);
    }

    destroy() {
        this._listeners.clear();
    }
}
