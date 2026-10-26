// ABOUTME: Unit tests for the plugin registry that decides what the island shows.
// ABOUTME: Uses plain object plugins that satisfy the registry contract.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PluginRegistry} from '../../src/core/plugin-registry.js';

const plugin = (id, {priority = 0, active = false} = {}) => {
    const actions = [];
    return {
        id,
        priority,
        actions,
        hasActivity: () => active,
        handleAction: action => actions.push(action),
        getState: () => ({id, active}),
    };
};

test('lists plugins in registration order', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('a'));
    registry.register(plugin('b'));
    assert.deepEqual(registry.list().map(p => p.id), ['a', 'b']);
});

test('rejects duplicate plugin ids', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('a'));
    assert.throws(() => registry.register(plugin('a')), /already registered: a/);
});

test('unregister removes a plugin', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('a'));
    registry.unregister('a');
    assert.equal(registry.get('a'), undefined);
    assert.deepEqual(registry.list(), []);
});

test('foreground is null when nothing is registered', () => {
    assert.equal(new PluginRegistry().foreground(), null);
});

test('foreground falls back to the first plugin when none has activity', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('a'));
    registry.register(plugin('b', {priority: 10}));
    assert.equal(registry.foreground().id, 'a');
});

test('foreground prefers the active plugin with highest priority', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('idle', {priority: 99}));
    registry.register(plugin('low', {priority: 1, active: true}));
    registry.register(plugin('high', {priority: 5, active: true}));
    assert.equal(registry.foreground().id, 'high');
});

test('dispatch forwards the action to the plugin', () => {
    const registry = new PluginRegistry();
    const target = plugin('a');
    registry.register(target);
    registry.dispatch('a', 'toggle');
    assert.deepEqual(target.actions, ['toggle']);
});

test('dispatch to an unknown plugin throws', () => {
    assert.throws(() => new PluginRegistry().dispatch('nope', 'toggle'), /unknown plugin: nope/);
});

test('subscribers are notified when plugins change and can unsubscribe', () => {
    const registry = new PluginRegistry();
    let calls = 0;
    const unsubscribe = registry.subscribe(() => calls++);
    registry.register(plugin('a'));
    registry.unregister('a');
    unsubscribe();
    registry.register(plugin('b'));
    assert.equal(calls, 2);
});
