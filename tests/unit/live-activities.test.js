// ABOUTME: Unit tests for the live activities plugin that external tools push into the island.
// ABOUTME: Drives a controllable clock to check ordering and expiry.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {LiveActivitiesPlugin} from '../../src/plugins/activities/plugin.js';

function setup() {
    const clock = {now: 0};
    const plugin = new LiveActivitiesPlugin({clock: () => clock.now});
    const events = [];
    plugin.subscribe(event => events.push(event));
    return {clock, plugin, events};
}

const ids = plugin => plugin.getState().activities.map(activity => activity.id);

test('starts without activity', () => {
    const {plugin} = setup();
    assert.equal(plugin.hasActivity(), false);
    assert.deepEqual(plugin.getState(), {activities: []});
});

test('push adds an activity with defaults and notifies', () => {
    const {plugin, events} = setup();
    plugin.handleAction('push', {id: 'build', title: 'cargo build'});

    assert.equal(plugin.hasActivity(), true);
    assert.deepEqual(plugin.getState().activities, [{
        id: 'build',
        title: 'cargo build',
        subtitle: '',
        progress: null,
        icon: '',
        accent: 'normal',
    }]);
    assert.deepEqual(events, [{type: 'changed'}]);
});

test('push with an existing id updates it in place', () => {
    const {plugin} = setup();
    plugin.handleAction('push', {id: 'build', title: 'cargo build', progress: 0.2});
    plugin.handleAction('push', {id: 'build', title: 'cargo build', progress: 0.8, subtitle: 'linking'});

    const [activity] = plugin.getState().activities;
    assert.equal(activity.progress, 0.8);
    assert.equal(activity.subtitle, 'linking');
    assert.equal(plugin.getState().activities.length, 1);
});

test('accepts numbers sent as strings, as command lines do', () => {
    const {plugin} = setup();
    plugin.handleAction('push', {id: 'a', title: 'A', progress: '0.5', timeoutSeconds: '10'});
    assert.equal(plugin.getState().activities[0].progress, 0.5);
});

test('attention activities come first, then the most recently pushed', () => {
    const {clock, plugin} = setup();
    plugin.handleAction('push', {id: 'old', title: 'Old'});
    clock.now = 1000;
    plugin.handleAction('push', {id: 'alert', title: 'Alert', accent: 'attention'});
    clock.now = 2000;
    plugin.handleAction('push', {id: 'new', title: 'New'});

    assert.deepEqual(ids(plugin), ['alert', 'new', 'old']);
});

test('end removes an activity; ending an unknown id is a no-op', () => {
    const {plugin, events} = setup();
    plugin.handleAction('push', {id: 'a', title: 'A'});
    plugin.handleAction('end', {id: 'a'});
    plugin.handleAction('end', {id: 'missing'});

    assert.equal(plugin.hasActivity(), false);
    assert.deepEqual(events, [{type: 'changed'}, {type: 'changed'}]);
});

test('clear removes every activity', () => {
    const {plugin} = setup();
    plugin.handleAction('push', {id: 'a', title: 'A'});
    plugin.handleAction('push', {id: 'b', title: 'B'});
    plugin.handleAction('clear');
    assert.equal(plugin.hasActivity(), false);
});

test('tick removes activities whose timeout elapsed', () => {
    const {clock, plugin, events} = setup();
    plugin.handleAction('push', {id: 'short', title: 'Short', timeoutSeconds: 5});
    plugin.handleAction('push', {id: 'forever', title: 'Forever'});
    events.length = 0;

    clock.now = 4999;
    plugin.tick();
    assert.deepEqual(events, []);

    clock.now = 5000;
    plugin.tick();
    assert.deepEqual(ids(plugin), ['forever']);
    assert.deepEqual(events, [{type: 'changed'}]);
});

test('pushing again restarts the timeout', () => {
    const {clock, plugin} = setup();
    plugin.handleAction('push', {id: 'a', title: 'A', timeoutSeconds: 5});
    clock.now = 4000;
    plugin.handleAction('push', {id: 'a', title: 'A', timeoutSeconds: 5});
    clock.now = 6000;
    plugin.tick();
    assert.deepEqual(ids(plugin), ['a']);
});

test('rejects invalid payloads without changing state', () => {
    const {plugin, events} = setup();
    assert.throws(() => plugin.handleAction('push', {title: 'no id'}), /id is required/);
    assert.throws(() => plugin.handleAction('push', {id: 'a'}), /title is required/);
    assert.throws(() => plugin.handleAction('push', {id: 'a', title: 'A', progress: 2}), /progress/);
    assert.throws(() => plugin.handleAction('push', {id: 'a', title: 'A', accent: 'loud'}), /accent/);
    assert.throws(() => plugin.handleAction('push', {id: 'a', title: 'A', timeoutSeconds: 0}), /timeoutSeconds/);
    assert.throws(() => plugin.handleAction('end', {}), /id is required/);
    assert.throws(() => plugin.handleAction('explode'), /unknown activities action: explode/);
    assert.equal(plugin.hasActivity(), false);
    assert.deepEqual(events, []);
});
