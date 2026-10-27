// ABOUTME: Unit tests for island control methods that do not involve plugins.
// ABOUTME: Covers opening the settings window through the callback the shell provides.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {IslandControl} from '../../src/core/island-control.js';
import {PluginRegistry} from '../../src/core/plugin-registry.js';

test('OpenSettings calls the provided callback', () => {
    let opened = 0;
    const control = new IslandControl(new PluginRegistry(), {openSettings: () => opened++});
    control.OpenSettings();
    assert.equal(opened, 1);
});

test('OpenSettings without a callback reports it is unavailable', () => {
    assert.throws(() => new IslandControl(new PluginRegistry()).OpenSettings(), /settings window is not available/);
});
