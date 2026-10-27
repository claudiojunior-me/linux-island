// ABOUTME: Todoist plugin: today's and overdue tasks, the top one shown as the current task.
// ABOUTME: Completing a task removes it at once and restores it if Todoist rejects the change.
import {Listeners} from '../../core/listeners.js';
import {normalizeTask, orderTasks} from './tasks.js';

const REFRESH_INTERVAL_MS = 5 * 60_000;

export class TodoistPlugin {
    constructor({clock = () => Date.now()} = {}) {
        this.id = 'todoist';
        this.title = 'Todoist';
        this.priority = 5;
        this.showsWhenIdle = false;
        this._clock = clock;
        this._client = null;
        // Bumped whenever the client changes, so answers meant for an older client are dropped.
        this._generation = 0;
        this._lastRefreshAt = null;
        this._state = {status: 'needs-token', tasks: [], error: null};
        this._listeners = new Listeners();
    }

    hasActivity() {
        return this._state.tasks.length > 0;
    }

    // client offers fetchTodayTasks() and closeTask(id); null when no token is configured.
    setClient(client) {
        this._client = client;
        this._generation++;
        this._lastRefreshAt = null;
        this._setState({status: client ? 'loading' : 'needs-token', tasks: [], error: null});
        return client ? this._refresh() : Promise.resolve();
    }

    handleAction(action, payload) {
        switch (action) {
        case 'refresh':
            return this._refresh();
        case 'complete':
            if (typeof payload?.id !== 'string' || payload.id === '')
                throw new Error('task id is required');
            return this._complete(payload.id);
        default:
            throw new Error(`unknown todoist action: ${action}`);
        }
    }

    tick() {
        if (!this._client || this._lastRefreshAt === null)
            return undefined;
        if (this._clock() - this._lastRefreshAt < REFRESH_INTERVAL_MS)
            return undefined;
        return this._refresh();
    }

    getState() {
        const {status, tasks, error} = this._state;
        return {status, tasks: [...tasks], current: tasks[0] ?? null, error};
    }

    subscribe(listener) {
        return this._listeners.add(listener);
    }

    destroy() {
        this._generation++;
        this._listeners.clear();
    }

    async _refresh() {
        if (!this._client)
            return;
        const generation = this._generation;
        this._lastRefreshAt = this._clock();
        try {
            const tasks = orderTasks((await this._client.fetchTodayTasks()).map(normalizeTask));
            if (generation === this._generation)
                this._setState({status: 'ready', tasks, error: null});
        } catch (error) {
            if (generation === this._generation)
                this._setState({...this._state, status: 'ready', error: String(error.message ?? error)});
        }
    }

    async _complete(id) {
        const task = this._state.tasks.find(candidate => candidate.id === id);
        if (!task || !this._client)
            return;
        const generation = this._generation;
        this._setState({...this._state, tasks: this._state.tasks.filter(candidate => candidate !== task)});
        try {
            await this._client.closeTask(id);
        } catch (error) {
            if (generation === this._generation) {
                this._setState({
                    ...this._state,
                    tasks: orderTasks([...this._state.tasks, task]),
                    error: String(error.message ?? error),
                });
            }
        }
    }

    _setState(state) {
        this._state = state;
        this._listeners.emit({type: 'changed'});
    }
}
