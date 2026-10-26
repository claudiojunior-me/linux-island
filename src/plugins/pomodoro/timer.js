// ABOUTME: Pomodoro state machine cycling work, short break and long break phases.
// ABOUTME: Time is passed in as millisecond timestamps, so it runs in GJS and Node alike.

export const Phase = Object.freeze({
    WORK: 'work',
    SHORT_BREAK: 'short-break',
    LONG_BREAK: 'long-break',
});

const MINUTE_MS = 60_000;

const DEFAULTS = Object.freeze({
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 4,
});

export class PomodoroTimer {
    constructor(options = {}) {
        const settings = {...DEFAULTS, ...options};
        for (const [name, value] of Object.entries(settings)) {
            if (!(value > 0))
                throw new RangeError(`${name} must be positive, got ${value}`);
        }

        this._durations = {
            [Phase.WORK]: settings.workMinutes * MINUTE_MS,
            [Phase.SHORT_BREAK]: settings.shortBreakMinutes * MINUTE_MS,
            [Phase.LONG_BREAK]: settings.longBreakMinutes * MINUTE_MS,
        };
        this._sessionsBeforeLongBreak = settings.sessionsBeforeLongBreak;
        this.reset();
    }

    start(now) {
        if (this._startedAt === null)
            this._startedAt = now;
    }

    pause(now) {
        if (this._startedAt === null)
            return;
        this._elapsedBeforeStart += now - this._startedAt;
        this._startedAt = null;
    }

    reset() {
        this._completedWorkSessions = 0;
        this._enterPhase(Phase.WORK);
    }

    skip() {
        this._enterPhase(this._nextPhase());
    }

    // Moves to the next phase once the running one has elapsed; returns the finished phase or null.
    tick(now) {
        if (this._startedAt === null || this._remaining(now) > 0)
            return null;

        const finished = this._phase;
        const next = this._nextPhase();
        if (finished === Phase.WORK)
            this._completedWorkSessions++;
        this._enterPhase(next);
        return finished;
    }

    snapshot(now) {
        return {
            phase: this._phase,
            running: this._startedAt !== null,
            remainingMs: this._remaining(now),
            totalMs: this._durations[this._phase],
            completedWorkSessions: this._completedWorkSessions,
        };
    }

    _enterPhase(phase) {
        this._phase = phase;
        this._startedAt = null;
        this._elapsedBeforeStart = 0;
    }

    _nextPhase() {
        if (this._phase !== Phase.WORK)
            return Phase.WORK;
        // Counts the work session in progress, so a skipped session still schedules the right break.
        const sessions = this._completedWorkSessions + 1;
        return sessions % this._sessionsBeforeLongBreak === 0 ? Phase.LONG_BREAK : Phase.SHORT_BREAK;
    }

    _remaining(now) {
        const running = this._startedAt === null ? 0 : now - this._startedAt;
        const elapsed = this._elapsedBeforeStart + Math.max(0, running);
        return Math.max(0, this._durations[this._phase] - elapsed);
    }
}
