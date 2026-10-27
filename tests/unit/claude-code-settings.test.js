// ABOUTME: Unit tests for adding and removing the island hook in Claude Code settings.
// ABOUTME: Checks that hooks the user already has are never touched.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {HOOK_EVENTS, addIslandHooks, removeIslandHooks} from '../../src/integrations/claude-code/settings.js';

const COMMAND = 'node /opt/linux-island/bin/claude-code-hook';
const islandEntry = {hooks: [{type: 'command', command: COMMAND}]};

test('adds the hook for every event to empty settings', () => {
    const settings = addIslandHooks({}, COMMAND);
    assert.deepEqual(Object.keys(settings.hooks).sort(), [...HOOK_EVENTS].sort());
    for (const event of HOOK_EVENTS)
        assert.deepEqual(settings.hooks[event], [islandEntry]);
});

test('keeps existing settings and hooks', () => {
    const userEntry = {matcher: '', hooks: [{type: 'command', command: 'notify-send hi'}]};
    const settings = addIslandHooks({model: 'opus', hooks: {Stop: [userEntry], PreToolUse: [userEntry]}}, COMMAND);
    assert.equal(settings.model, 'opus');
    assert.deepEqual(settings.hooks.Stop, [userEntry, islandEntry]);
    assert.deepEqual(settings.hooks.PreToolUse, [userEntry]);
});

test('adding twice does not duplicate', () => {
    const once = addIslandHooks({}, COMMAND);
    assert.deepEqual(addIslandHooks(once, COMMAND), once);
});

test('does not modify the input object', () => {
    const input = {hooks: {Stop: []}};
    addIslandHooks(input, COMMAND);
    assert.deepEqual(input, {hooks: {Stop: []}});
});

test('remove takes out only the island hook and drops emptied events', () => {
    const userEntry = {hooks: [{type: 'command', command: 'notify-send hi'}]};
    const installed = addIslandHooks({hooks: {Stop: [userEntry]}}, COMMAND);
    assert.deepEqual(removeIslandHooks(installed, COMMAND), {hooks: {Stop: [userEntry]}});
});

test('remove drops the hooks key when nothing is left', () => {
    assert.deepEqual(removeIslandHooks(addIslandHooks({model: 'opus'}, COMMAND), COMMAND), {model: 'opus'});
});
