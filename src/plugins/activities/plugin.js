// ABOUTME: Live activities plugin: short-lived cards that scripts and tools push into the island over D-Bus.
// ABOUTME: Activities needing attention sort first; the rest by most recent push. Optional timeouts end them.
import {Listeners} from '../../core/listeners.js';

export const ACCENTS = Object.freeze(['normal', 'attention', 'success', 'error']);

function requireId(payload) {
    if (typeof payload?.id !== 'string' || payload.id === '')
        throw new Error('activity id is required');
    return payload.id;
}

function parseActivity(payload) {
    const id = requireId(payload);
    if (payload.title === undefined || String(payload.title) === '')
        throw new Error('activity title is required');

    const progress = payload.progress === undefined || payload.progress === null ? null : Number(payload.progress);
    if (progress !== null && !(progress >= 0 && progress <= 1))
        throw new Error(`activity progress must be between 0 and 1, got ${payload.progress}`);

    const accent = payload.accent ?? 'normal';
    if (!ACCENTS.includes(accent))
        throw new Error(`activity accent must be one of ${ACCENTS.join(', ')}, got ${accent}`);

    const timeoutSeconds = payload.timeoutSeconds === undefined ? null : Number(payload.timeoutSeconds);
    if (timeoutSeconds !== null && !(timeoutSeconds > 0))
        throw new Error(`activity timeoutSeconds must be positive, got ${payload.timeoutSeconds}`);

    return {
        id,
        title: String(payload.title),
        subtitle: String(payload.subtitle ?? ''),
        progress,
        icon: String(payload.icon ?? ''),
        accent,
        timeoutSeconds,
    };
}

export class LiveActivitiesPlugin {
    constructor({clock = () => Date.now()} = {}) {
        this.id = 'activities';
        this.title = 'Activities';
        this.priority = 20;
        this._clock = clock;
        this._activities = new Map();
        this._pushSequence = 0;
        this._listeners = new Listeners();
    }

    hasActivity() {
        return this._activities.size > 0;
    }

    handleAction(action, payload) {
        switch (action) {
        case 'push':
            this._push(parseActivity(payload));
            break;
        case 'end':
            if (!this._activities.delete(requireId(payload)))
                return;
            break;
        case 'clear':
            this._activities.clear();
            break;
        default:
            throw new Error(`unknown activities action: ${action}`);
        }
        this._listeners.emit({type: 'changed'});
    }

    tick() {
        const now = this._clock();
        let removed = false;
        for (const [id, entry] of this._activities) {
            if (entry.expiresAt !== null && entry.expiresAt <= now) {
                this._activities.delete(id);
                removed = true;
            }
        }
        if (removed)
            this._listeners.emit({type: 'changed'});
    }

    getState() {
        const entries = [...this._activities.values()].sort((a, b) =>
            (b.activity.accent === 'attention') - (a.activity.accent === 'attention') ||
            b.pushOrder - a.pushOrder);
        return {
            activities: entries.map(({activity: {timeoutSeconds: _timeout, ...visible}}) => visible),
        };
    }

    subscribe(listener) {
        return this._listeners.add(listener);
    }

    destroy() {
        this._listeners.clear();
    }

    _push(activity) {
        const now = this._clock();
        this._activities.set(activity.id, {
            activity,
            pushOrder: ++this._pushSequence,
            expiresAt: activity.timeoutSeconds === null ? null : now + activity.timeoutSeconds * 1000,
        });
    }
}
