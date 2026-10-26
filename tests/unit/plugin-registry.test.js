// ABOUTME: Unit tests for the plugin registry that decides what the island shows.
// ABOUTME: Uses plain object plugins that satisfy the registry contract.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PluginRegistry} from '../../src/core/plugin-registry.js';

const plugin = (id, {priority = 0, active = false, showsWhenIdle = false} = {}) => {
    const actions = [];
    return {
        id,
        priority,
        showsWhenIdle,
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

test('foreground falls back to a plugin that shows when idle', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('hidden', {priority: 10}));
    registry.register(plugin('idle', {showsWhenIdle: true}));
    assert.equal(registry.foreground().id, 'idle');
});

test('foreground is null when nothing is active or shown when idle', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('hidden'));
    assert.equal(registry.foreground(), null);
});

test('visible lists active plugins by priority, then idle ones by registration, up to the limit', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('idle-a', {showsWhenIdle: true}));
    registry.register(plugin('hidden'));
    registry.register(plugin('active-low', {priority: 1, active: true}));
    registry.register(plugin('idle-b', {showsWhenIdle: true}));
    registry.register(plugin('active-high', {priority: 9, active: true}));

    const ids = limit => registry.visible(limit).map(p => p.id);
    assert.deepEqual(ids(5), ['active-high', 'active-low', 'idle-a', 'idle-b']);
    assert.deepEqual(ids(2), ['active-high', 'active-low']);
    assert.deepEqual(ids(1), ['active-high']);
});

test('an active plugin that shows when idle is listed once', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('both', {active: true, showsWhenIdle: true}));
    assert.deepEqual(registry.visible(2).map(p => p.id), ['both']);
});

test('equal priorities keep registration order', () => {
    const registry = new PluginRegistry();
    registry.register(plugin('first', {priority: 5, active: true}));
    registry.register(plugin('second', {priority: 5, active: true}));
    assert.deepEqual(registry.visible(2).map(p => p.id), ['first', 'second']);
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
