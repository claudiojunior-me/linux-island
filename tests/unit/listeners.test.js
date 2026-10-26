// ABOUTME: Unit tests for the listener set used by plugins and the registry.
// ABOUTME: Covers emitting arguments, unsubscribing and clearing.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {Listeners} from '../../src/core/listeners.js';

test('emit calls every listener with the arguments', () => {
    const listeners = new Listeners();
    const received = [];
    listeners.add(value => received.push(['a', value]));
    listeners.add(value => received.push(['b', value]));
    listeners.emit(42);
    assert.deepEqual(received, [['a', 42], ['b', 42]]);
});

test('the function returned by add removes the listener', () => {
    const listeners = new Listeners();
    let calls = 0;
    const remove = listeners.add(() => calls++);
    remove();
    listeners.emit();
    assert.equal(calls, 0);
});

test('clear removes every listener', () => {
    const listeners = new Listeners();
    let calls = 0;
    listeners.add(() => calls++);
    listeners.clear();
    listeners.emit();
    assert.equal(calls, 0);
});
