// ABOUTME: Unit tests for the privacy plugin that aggregates microphone, screen and camera use.
// ABOUTME: Sensors are fed through setters, as the shell monitors do.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PrivacyPlugin} from '../../src/plugins/privacy/plugin.js';

function setup() {
    const plugin = new PrivacyPlugin();
    const events = [];
    plugin.subscribe(event => events.push(event));
    return {plugin, events};
}

test('starts idle with camera support unknown, hidden when idle, above live activities', () => {
    const {plugin} = setup();
    assert.equal(plugin.hasActivity(), false);
    assert.equal(plugin.showsWhenIdle, false);
    assert.equal(plugin.priority, 30);
    assert.deepEqual(plugin.getState(), {microphoneApps: [], screen: null, camera: null});
});

test('microphone apps make the plugin active, sorted and deduplicated', () => {
    const {plugin} = setup();
    plugin.setMicrophoneApps(['Zoom', 'Firefox', 'Zoom']);
    assert.equal(plugin.hasActivity(), true);
    assert.deepEqual(plugin.getState().microphoneApps, ['Firefox', 'Zoom']);
});

test('screen sessions report recording over sharing', () => {
    const {plugin} = setup();
    plugin.setScreenSessions(['sharing']);
    assert.equal(plugin.getState().screen, 'sharing');
    plugin.setScreenSessions(['sharing', 'recording']);
    assert.equal(plugin.getState().screen, 'recording');
    plugin.setScreenSessions([]);
    assert.equal(plugin.getState().screen, null);
    assert.equal(plugin.hasActivity(), false);
});

test('camera in use is activity; supported but idle is not', () => {
    const {plugin} = setup();
    plugin.setCameraInUse(false);
    assert.equal(plugin.getState().camera, false);
    assert.equal(plugin.hasActivity(), false);
    plugin.setCameraInUse(true);
    assert.equal(plugin.hasActivity(), true);
});

test('notifies only when the state really changes', () => {
    const {plugin, events} = setup();
    plugin.setMicrophoneApps(['Firefox']);
    plugin.setMicrophoneApps(['Firefox']);
    plugin.setScreenSessions([]);
    plugin.setCameraInUse(null);
    assert.deepEqual(events, [{type: 'changed'}]);
});

test('has no actions', () => {
    const {plugin} = setup();
    assert.throws(() => plugin.handleAction('stop'), /unknown privacy action: stop/);
});
