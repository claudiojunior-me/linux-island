// ABOUTME: Privacy plugin: shows which apps use the microphone and whether the screen or camera is in use.
// ABOUTME: Holds no sensors; the shell part feeds it through the set* methods.
import {Listeners} from '../../core/listeners.js';

export class PrivacyPlugin {
    constructor() {
        this.id = 'privacy';
        this.title = 'Privacy';
        this.priority = 30;
        this.showsWhenIdle = false;
        // camera is null while the shell offers no way to watch it.
        this._state = {microphoneApps: [], screen: null, camera: null};
        this._listeners = new Listeners();
    }

    hasActivity() {
        const {microphoneApps, screen, camera} = this._state;
        return microphoneApps.length > 0 || screen !== null || camera === true;
    }

    handleAction(action) {
        throw new Error(`unknown privacy action: ${action}`);
    }

    setMicrophoneApps(names) {
        this._update({microphoneApps: [...new Set(names)].sort()});
    }

    // kinds holds 'sharing' or 'recording' for each active screen session.
    setScreenSessions(kinds) {
        let screen = null;
        if (kinds.includes('recording'))
            screen = 'recording';
        else if (kinds.length > 0)
            screen = 'sharing';
        this._update({screen});
    }

    setCameraInUse(inUse) {
        this._update({camera: inUse});
    }

    getState() {
        return {...this._state, microphoneApps: [...this._state.microphoneApps]};
    }

    subscribe(listener) {
        return this._listeners.add(listener);
    }

    destroy() {
        this._listeners.clear();
    }

    _update(changes) {
        const next = {...this._state, ...changes};
        if (JSON.stringify(next) === JSON.stringify(this._state))
            return;
        this._state = next;
        this._listeners.emit({type: 'changed'});
    }
}
