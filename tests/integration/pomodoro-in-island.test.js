// ABOUTME: Integration tests for the pomodoro plugin running inside the registry and island control API.
// ABOUTME: Uses a controllable clock instead of real time; every other piece is the real implementation.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PluginRegistry} from '../../src/core/plugin-registry.js';
import {IslandControl} from '../../src/core/island-control.js';
import {PomodoroPlugin} from '../../src/plugins/pomodoro/plugin.js';

const MINUTE = 60_000;

function setup() {
    const clock = {now: 0};
    const registry = new PluginRegistry();
    const pomodoro = new PomodoroPlugin({
        clock: () => clock.now,
        timerOptions: {workMinutes: 25, shortBreakMinutes: 5},
    });
    registry.register(pomodoro);
    return {clock, registry, pomodoro, control: new IslandControl(registry)};
}

test('control lists registered plugins', () => {
    const {control} = setup();
    assert.deepEqual(control.ListPlugins(), ['pomodoro']);
});

test('toggle through the control starts and pauses the timer', () => {
    const {clock, control} = setup();
    control.Activate('pomodoro', 'toggle');
    clock.now = 2 * MINUTE;

    let state = JSON.parse(control.GetState('pomodoro'));
    assert.equal(state.running, true);
    assert.equal(state.countdown, '23:00');

    control.Activate('pomodoro', 'toggle');
    clock.now = 10 * MINUTE;
    state = JSON.parse(control.GetState('pomodoro'));
    assert.equal(state.running, false);
    assert.equal(state.countdown, '23:00');
});

test('idle pomodoro stays on the island; idle plugins that hide when idle never show', () => {
    const {registry, control} = setup();
    registry.register({
        id: 'idle-high',
        priority: 100,
        hasActivity: () => false,
        handleAction: () => {},
        getState: () => ({}),
    });

    assert.equal(control.GetForeground(), 'pomodoro');
    registry.unregister('pomodoro');
    assert.equal(control.GetForeground(), '');
});

test('paused mid-phase still counts as activity, reset clears it', () => {
    const {clock, pomodoro, control} = setup();
    assert.equal(pomodoro.hasActivity(), false);

    control.Activate('pomodoro', 'start');
    clock.now = MINUTE;
    control.Activate('pomodoro', 'pause');
    assert.equal(pomodoro.hasActivity(), true);

    control.Activate('pomodoro', 'reset');
    assert.equal(pomodoro.hasActivity(), false);
});

test('tick announces a finished phase to subscribers', () => {
    const {clock, pomodoro, control} = setup();
    const events = [];
    pomodoro.subscribe(event => events.push(event));

    control.Activate('pomodoro', 'start');
    clock.now = 25 * MINUTE;
    pomodoro.tick();

    assert.deepEqual(events, [
        {type: 'changed'},
        {type: 'phase-finished', phase: 'work', next: 'short-break'},
        {type: 'changed'},
    ]);
    assert.equal(JSON.parse(control.GetState('pomodoro')).phase, 'short-break');
});

test('tick without a finished phase still refreshes subscribers while running', () => {
    const {clock, pomodoro} = setup();
    const events = [];
    pomodoro.handleAction('start');
    pomodoro.subscribe(event => events.push(event));

    clock.now = MINUTE;
    pomodoro.tick();
    pomodoro.handleAction('pause');
    pomodoro.tick();

    assert.deepEqual(events, [{type: 'changed'}, {type: 'changed'}]);
});

test('skip moves to the break through the control', () => {
    const {control} = setup();
    control.Activate('pomodoro', 'skip');
    const state = JSON.parse(control.GetState('pomodoro'));
    assert.equal(state.phase, 'short-break');
    assert.equal(state.countdown, '05:00');
});

test('state exposes progress between 0 and 1', () => {
    const {clock, control} = setup();
    control.Activate('pomodoro', 'start');
    clock.now = 5 * MINUTE;
    assert.equal(JSON.parse(control.GetState('pomodoro')).progress, 0.2);
});

test('unknown actions and plugins are rejected', () => {
    const {control} = setup();
    assert.throws(() => control.Activate('pomodoro', 'explode'), /unknown pomodoro action: explode/);
    assert.throws(() => control.Activate('nope', 'toggle'), /unknown plugin: nope/);
    assert.throws(() => control.GetState('nope'), /unknown plugin: nope/);
});

test('configure changes the countdown shown while idle', () => {
    const {pomodoro, control} = setup();
    const events = [];
    pomodoro.subscribe(event => events.push(event));
    pomodoro.configure({workMinutes: 1});
    assert.equal(JSON.parse(control.GetState('pomodoro')).countdown, '01:00');
    assert.deepEqual(events, [{type: 'changed'}]);
});

test('Send passes a JSON payload to the plugin action', () => {
    const {registry, control} = setup();
    const received = [];
    registry.register({
        id: 'probe',
        priority: 0,
        hasActivity: () => false,
        handleAction: (action, payload) => received.push([action, payload]),
        getState: () => ({}),
    });
    control.Send('probe', 'push', '{"id":"a","title":"A"}');
    assert.deepEqual(received, [['push', {id: 'a', title: 'A'}]]);
});

test('Send rejects payloads that are not JSON objects', () => {
    const {control} = setup();
    assert.throws(() => control.Send('pomodoro', 'toggle', 'not json'), /payload must be a JSON object/);
    assert.throws(() => control.Send('pomodoro', 'toggle', '[1]'), /payload must be a JSON object/);
});
