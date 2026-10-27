// ABOUTME: Unit tests for the pomodoro timer state machine.
// ABOUTME: Drives the timer with explicit timestamps so no real clock is involved.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PomodoroTimer, Phase} from '../../src/plugins/pomodoro/timer.js';

const MINUTE = 60_000;

const shortTimer = () => new PomodoroTimer({
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    sessionsBeforeLongBreak: 2,
});

test('starts idle in work phase with full duration', () => {
    const timer = shortTimer();
    assert.deepEqual(timer.snapshot(0), {
        phase: Phase.WORK,
        running: false,
        remainingMs: 25 * MINUTE,
        totalMs: 25 * MINUTE,
        completedWorkSessions: 0,
    });
});

test('counts down only while running', () => {
    const timer = shortTimer();
    timer.start(1000);
    assert.equal(timer.snapshot(1000 + MINUTE).remainingMs, 24 * MINUTE);

    timer.pause(1000 + MINUTE);
    assert.equal(timer.snapshot(1000 + 10 * MINUTE).remainingMs, 24 * MINUTE);
    assert.equal(timer.snapshot(1000 + 10 * MINUTE).running, false);

    timer.start(1000 + 10 * MINUTE);
    assert.equal(timer.snapshot(1000 + 12 * MINUTE).remainingMs, 22 * MINUTE);
});

test('start and pause are idempotent', () => {
    const timer = shortTimer();
    timer.start(0);
    timer.start(MINUTE);
    assert.equal(timer.snapshot(2 * MINUTE).remainingMs, 23 * MINUTE);

    timer.pause(2 * MINUTE);
    timer.pause(5 * MINUTE);
    assert.equal(timer.snapshot(9 * MINUTE).remainingMs, 23 * MINUTE);
});

test('remaining time never goes below zero', () => {
    const timer = shortTimer();
    timer.start(0);
    assert.equal(timer.snapshot(60 * MINUTE).remainingMs, 0);
});

test('tick returns null while the phase is still running', () => {
    const timer = shortTimer();
    timer.start(0);
    assert.equal(timer.tick(MINUTE), null);
    assert.equal(timer.tick(0), null);
});

test('tick finishes work phase and stops on a short break', () => {
    const timer = shortTimer();
    timer.start(0);
    const finished = timer.tick(25 * MINUTE);

    assert.equal(finished, Phase.WORK);
    assert.deepEqual(timer.snapshot(25 * MINUTE), {
        phase: Phase.SHORT_BREAK,
        running: false,
        remainingMs: 5 * MINUTE,
        totalMs: 5 * MINUTE,
        completedWorkSessions: 1,
    });
});

test('tick on a paused timer never finishes a phase', () => {
    const timer = shortTimer();
    assert.equal(timer.tick(99 * MINUTE), null);
});

test('long break follows the configured number of work sessions', () => {
    const timer = shortTimer();
    let now = 0;
    const finishPhase = () => {
        timer.start(now);
        now += timer.snapshot(now).remainingMs;
        return timer.tick(now);
    };

    assert.equal(finishPhase(), Phase.WORK);
    assert.equal(timer.snapshot(now).phase, Phase.SHORT_BREAK);
    assert.equal(finishPhase(), Phase.SHORT_BREAK);
    assert.equal(timer.snapshot(now).phase, Phase.WORK);
    assert.equal(finishPhase(), Phase.WORK);
    assert.equal(timer.snapshot(now).phase, Phase.LONG_BREAK);
    assert.equal(timer.snapshot(now).remainingMs, 15 * MINUTE);
    assert.equal(finishPhase(), Phase.LONG_BREAK);
    assert.equal(timer.snapshot(now).phase, Phase.WORK);
    assert.equal(timer.snapshot(now).completedWorkSessions, 2);
});

test('skip ends the current phase without counting it as completed', () => {
    const timer = shortTimer();
    timer.start(0);
    timer.skip(MINUTE);

    const snapshot = timer.snapshot(MINUTE);
    assert.equal(snapshot.phase, Phase.SHORT_BREAK);
    assert.equal(snapshot.running, false);
    assert.equal(snapshot.completedWorkSessions, 0);
});

test('reset returns to an idle work phase and clears completed sessions', () => {
    const timer = shortTimer();
    timer.start(0);
    timer.tick(25 * MINUTE);
    timer.start(25 * MINUTE);
    timer.reset();

    assert.deepEqual(timer.snapshot(30 * MINUTE), {
        phase: Phase.WORK,
        running: false,
        remainingMs: 25 * MINUTE,
        totalMs: 25 * MINUTE,
        completedWorkSessions: 0,
    });
});

test('uses classic pomodoro durations by default', () => {
    const timer = new PomodoroTimer();
    assert.equal(timer.snapshot(0).totalMs, 25 * MINUTE);
});

test('rejects non-positive durations', () => {
    assert.throws(() => new PomodoroTimer({workMinutes: 0}), /workMinutes/);
    assert.throws(() => new PomodoroTimer({sessionsBeforeLongBreak: -1}), /sessionsBeforeLongBreak/);
});

test('configure on an untouched phase applies the new duration right away', () => {
    const timer = shortTimer();
    timer.configure({workMinutes: 1});
    assert.equal(timer.snapshot(0).totalMs, MINUTE);
    assert.equal(timer.snapshot(0).remainingMs, MINUTE);
});

test('configure mid-phase keeps the current phase and changes the next ones', () => {
    const timer = shortTimer();
    timer.start(0);
    timer.configure({workMinutes: 50, shortBreakMinutes: 10});
    assert.equal(timer.snapshot(MINUTE).totalMs, 25 * MINUTE);
    assert.equal(timer.snapshot(MINUTE).remainingMs, 24 * MINUTE);

    timer.tick(25 * MINUTE);
    assert.equal(timer.snapshot(25 * MINUTE).totalMs, 10 * MINUTE);
});

test('configure on a paused phase with elapsed time keeps the current duration', () => {
    const timer = shortTimer();
    timer.start(0);
    timer.pause(MINUTE);
    timer.configure({workMinutes: 1});
    assert.equal(timer.snapshot(MINUTE).remainingMs, 24 * MINUTE);
});

test('configure keeps unspecified settings', () => {
    const timer = shortTimer();
    timer.configure({workMinutes: 30});
    timer.skip();
    assert.equal(timer.snapshot(0).totalMs, 5 * MINUTE);
});

test('configure rejects non-positive values and leaves settings untouched', () => {
    const timer = shortTimer();
    assert.throws(() => timer.configure({shortBreakMinutes: 0}), /shortBreakMinutes/);
    timer.skip();
    assert.equal(timer.snapshot(0).totalMs, 5 * MINUTE);
});
