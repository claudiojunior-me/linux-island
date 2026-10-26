// ABOUTME: Unit tests for turning island command lines into D-Bus calls and reading gdbus output.
// ABOUTME: Pure functions only; running gdbus is covered by the end-to-end suite.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {parseCommand, parseGdbusString, parseGdbusStringArray} from '../../src/cli/command.js';

test('list, foreground and state map to read-only methods', () => {
    assert.deepEqual(parseCommand(['list']), {method: 'ListPlugins', args: []});
    assert.deepEqual(parseCommand(['foreground']), {method: 'GetForeground', args: []});
    assert.deepEqual(parseCommand(['state', 'pomodoro']), {method: 'GetState', args: ['pomodoro']});
});

test('plugin action without options maps to Activate', () => {
    assert.deepEqual(parseCommand(['pomodoro', 'toggle']), {method: 'Activate', args: ['pomodoro', 'toggle']});
});

test('plugin action with options maps to Send with a camelCase JSON payload', () => {
    const command = parseCommand([
        'activities', 'push', '--id', 'build', '--title', 'cargo build', '--timeout-seconds', '10',
    ]);
    assert.equal(command.method, 'Send');
    assert.deepEqual(command.args.slice(0, 2), ['activities', 'push']);
    assert.deepEqual(JSON.parse(command.args[2]), {id: 'build', title: 'cargo build', timeoutSeconds: '10'});
});

test('option values may start with dashes when given with =', () => {
    const command = parseCommand(['activities', 'push', '--id=a', '--title=--weird--']);
    assert.deepEqual(JSON.parse(command.args[2]), {id: 'a', title: '--weird--'});
});

test('rejects incomplete commands', () => {
    assert.throws(() => parseCommand([]), /usage/);
    assert.throws(() => parseCommand(['state']), /usage/);
    assert.throws(() => parseCommand(['pomodoro']), /usage/);
    assert.throws(() => parseCommand(['activities', 'push', '--title']), /--title needs a value/);
    assert.throws(() => parseCommand(['activities', 'push', 'stray']), /unexpected argument: stray/);
});

test('reads gdbus string and string array results', () => {
    assert.equal(parseGdbusString("('pomodoro',)"), 'pomodoro');
    assert.equal(parseGdbusString(`('{"a":"it\\'s"}',)`), `{"a":"it's"}`);
    assert.deepEqual(parseGdbusStringArray("(['pomodoro', 'activities'],)"), ['pomodoro', 'activities']);
    assert.deepEqual(parseGdbusStringArray('(@as [],)'), []);
});

test('settings maps to OpenSettings', () => {
    assert.deepEqual(parseCommand(['settings']), {method: 'OpenSettings', args: []});
});
