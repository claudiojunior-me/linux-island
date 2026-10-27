// ABOUTME: Integration tests for live activities competing with the pomodoro for the island.
// ABOUTME: Real registry, control API and plugins with a controllable clock.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {IslandControl} from '../../src/core/island-control.js';
import {PluginRegistry} from '../../src/core/plugin-registry.js';
import {LiveActivitiesPlugin} from '../../src/plugins/activities/plugin.js';
import {PomodoroPlugin} from '../../src/plugins/pomodoro/plugin.js';

function setup() {
    const clock = {now: 0};
    const registry = new PluginRegistry();
    registry.register(new PomodoroPlugin({clock: () => clock.now}));
    registry.register(new LiveActivitiesPlugin({clock: () => clock.now}));
    return {clock, registry, control: new IslandControl(registry)};
}

test('a pushed activity takes the island from a running pomodoro and gives it back on end', () => {
    const {control} = setup();
    control.Activate('pomodoro', 'start');
    assert.equal(control.GetForeground(), 'pomodoro');

    control.Send('activities', 'push', JSON.stringify({id: 'build', title: 'Build'}));
    assert.equal(control.GetForeground(), 'activities');

    control.Send('activities', 'end', JSON.stringify({id: 'build'}));
    assert.equal(control.GetForeground(), 'pomodoro');
});

test('expired activities hand the island back after a tick', () => {
    const {clock, registry, control} = setup();
    control.Send('activities', 'push', JSON.stringify({id: 'done', title: 'Done', timeoutSeconds: 2}));
    clock.now = 2000;
    registry.list().forEach(plugin => plugin.tick?.());
    assert.equal(control.GetForeground(), 'pomodoro');
    assert.deepEqual(JSON.parse(control.GetState('activities')), {activities: []});
});

test('an activity and the idle pomodoro share the island, activity first', () => {
    const {registry, control} = setup();
    control.Send('activities', 'push', JSON.stringify({id: 'build', title: 'Build'}));
    assert.deepEqual(registry.visible(2).map(plugin => plugin.id), ['activities', 'pomodoro']);
});
