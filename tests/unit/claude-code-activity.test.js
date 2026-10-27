// ABOUTME: Unit tests for turning Claude Code hook events into live activity commands.
// ABOUTME: Inputs mirror the JSON Claude Code writes to a hook's stdin.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {activityCommandForHook} from '../../src/integrations/claude-code/activity.js';

const base = {session_id: '0123456789abcdef', cwd: '/home/claudio/projects/personal/linux-island'};

test('prompt submit shows the session as working', () => {
    assert.deepEqual(activityCommandForHook({...base, hook_event_name: 'UserPromptSubmit', prompt: 'hi'}), {
        action: 'push',
        payload: {id: 'claude-01234567', title: 'Claude · linux-island', subtitle: 'Working…', accent: 'normal'},
    });
});

test('notification asks for attention with the Claude message', () => {
    const command = activityCommandForHook({
        ...base, hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash',
    });
    assert.deepEqual(command.payload, {
        id: 'claude-01234567',
        title: 'Claude · linux-island',
        subtitle: 'Claude needs your permission to use Bash',
        accent: 'attention',
    });
});

test('notification without a message still asks for attention', () => {
    const command = activityCommandForHook({...base, hook_event_name: 'Notification'});
    assert.equal(command.payload.subtitle, 'Waiting for you');
});

test('stop shows a finished card that ends by itself', () => {
    assert.deepEqual(activityCommandForHook({...base, hook_event_name: 'Stop'}).payload, {
        id: 'claude-01234567',
        title: 'Claude · linux-island',
        subtitle: 'Finished, your turn',
        accent: 'success',
        timeoutSeconds: 120,
    });
});

test('session end removes the card', () => {
    assert.deepEqual(activityCommandForHook({...base, hook_event_name: 'SessionEnd'}), {
        action: 'end',
        payload: {id: 'claude-01234567'},
    });
});

test('other events and malformed input are ignored', () => {
    assert.equal(activityCommandForHook({...base, hook_event_name: 'PreToolUse'}), null);
    assert.equal(activityCommandForHook({hook_event_name: 'Stop'}), null);
    assert.equal(activityCommandForHook(null), null);
});

test('falls back to a generic title without a working directory', () => {
    const command = activityCommandForHook({session_id: 'abc', hook_event_name: 'Stop'});
    assert.equal(command.payload.title, 'Claude');
    assert.equal(command.payload.id, 'claude-abc');
});
