// ABOUTME: Unit tests for loading and unloading plugins to match the enabled list.
// ABOUTME: Uses the real registry with recording factories standing in for GNOME Shell views.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PluginLoader} from '../../src/core/plugin-loader.js';
import {PluginRegistry} from '../../src/core/plugin-registry.js';

function setup() {
    const log = [];
    const factory = id => ({
        create: () => ({
            id, priority: 0, hasActivity: () => false, handleAction: () => {},
            destroy: () => log.push(`destroy plugin ${id}`),
        }),
        createShell: (plugin, context) => {
            log.push(`shell ${plugin.id} ${context.tag}`);
            return {destroy: () => log.push(`destroy shell ${id}`)};
        },
    });
    const registry = new PluginRegistry();
    const shells = new Map();
    const loader = new PluginLoader({
        registry,
        shells,
        order: ['a', 'b', 'c'],
        factories: {a: factory('a'), b: factory('b'), c: factory('c')},
        context: {tag: 'ctx'},
    });
    const ids = () => registry.list().map(plugin => plugin.id);
    return {log, registry, shells, loader, ids};
}

test('loads enabled plugins in manifest order with their shells', () => {
    const {log, shells, loader, ids} = setup();
    loader.apply(['c', 'a']);
    assert.deepEqual(ids(), ['a', 'c']);
    assert.deepEqual([...shells.keys()].sort(), ['a', 'c']);
    assert.deepEqual(log, ['shell a ctx', 'shell c ctx']);
});

test('unloads disabled plugins: unregister first, then destroy shell and plugin', () => {
    const {log, registry, shells, loader, ids} = setup();
    loader.apply(['a', 'b']);
    log.length = 0;
    registry.subscribe(() => log.push(`registry changed, b registered: ${registry.get('b') !== undefined}`));

    loader.apply(['a']);
    assert.deepEqual(ids(), ['a']);
    assert.equal(shells.has('b'), false);
    assert.deepEqual(log, ['registry changed, b registered: false', 'destroy shell b', 'destroy plugin b']);
});

test('applying the same list twice changes nothing', () => {
    const {log, loader} = setup();
    loader.apply(['a']);
    log.length = 0;
    loader.apply(['a']);
    assert.deepEqual(log, []);
});

test('re-enabling creates fresh instances', () => {
    const {registry, loader} = setup();
    loader.apply(['a']);
    const first = registry.get('a');
    loader.apply([]);
    loader.apply(['a']);
    assert.notEqual(registry.get('a'), first);
});

test('unknown ids are ignored', () => {
    const {loader, ids} = setup();
    loader.apply(['a', 'nope']);
    assert.deepEqual(ids(), ['a']);
});

test('unloadAll removes everything', () => {
    const {log, shells, loader, ids} = setup();
    loader.apply(['a', 'b']);
    log.length = 0;
    loader.unloadAll();
    assert.deepEqual(ids(), []);
    assert.equal(shells.size, 0);
    assert.deepEqual(log, ['destroy shell a', 'destroy plugin a', 'destroy shell b', 'destroy plugin b']);
});
