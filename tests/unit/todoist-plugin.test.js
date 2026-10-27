// ABOUTME: Unit tests for the Todoist plugin: loading, current task, optimistic completion and refresh timing.
// ABOUTME: Uses an in-memory task source in place of the API client.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {TodoistPlugin} from '../../src/plugins/todoist/plugin.js';

const apiTask = (id, priority = 1) => ({
    id, content: `Task ${id}`, priority, child_order: 1, due: {date: '2026-10-26', datetime: null},
});

function memorySource(tasks) {
    const source = {
        tasks: [...tasks],
        closed: [],
        fetches: 0,
        failClose: false,
        async fetchTodayTasks() {
            source.fetches++;
            return source.tasks;
        },
        async closeTask(id) {
            if (source.failClose)
                throw new Error('network down');
            source.closed.push(id);
            source.tasks = source.tasks.filter(task => task.id !== id);
        },
    };
    return source;
}

function setup(tasks = [apiTask('a', 1), apiTask('b', 4)]) {
    const clock = {now: 0};
    const plugin = new TodoistPlugin({clock: () => clock.now});
    const source = memorySource(tasks);
    return {clock, plugin, source};
}

test('without a client the plugin asks for a token and stays hidden', () => {
    const {plugin} = setup();
    assert.equal(plugin.getState().status, 'needs-token');
    assert.equal(plugin.hasActivity(), false);
    assert.equal(plugin.showsWhenIdle, false);
});

test('setting a client loads tasks ordered with the current task first', async () => {
    const {plugin, source} = setup();
    await plugin.setClient(source);
    const state = plugin.getState();
    assert.equal(state.status, 'ready');
    assert.deepEqual(state.tasks.map(task => task.id), ['b', 'a']);
    assert.equal(state.current.id, 'b');
    assert.equal(plugin.hasActivity(), true);
});

test('no tasks today means no activity', async () => {
    const {plugin, source} = setup([]);
    await plugin.setClient(source);
    assert.equal(plugin.getState().current, null);
    assert.equal(plugin.hasActivity(), false);
});

test('complete removes the task at once and closes it remotely', async () => {
    const {plugin, source} = setup();
    await plugin.setClient(source);
    const done = plugin.handleAction('complete', {id: 'b'});
    assert.deepEqual(plugin.getState().tasks.map(task => task.id), ['a']);
    await done;
    assert.deepEqual(source.closed, ['b']);
});

test('a failed completion puts the task back and reports the error', async () => {
    const {plugin, source} = setup();
    await plugin.setClient(source);
    source.failClose = true;
    await plugin.handleAction('complete', {id: 'b'});
    const state = plugin.getState();
    assert.deepEqual(state.tasks.map(task => task.id), ['b', 'a']);
    assert.match(state.error, /network down/);
});

test('a failed load keeps the previous tasks and reports the error', async () => {
    const {plugin, source} = setup();
    await plugin.setClient(source);
    source.fetchTodayTasks = async () => {
        throw new Error('Todoist API 500');
    };
    await plugin.handleAction('refresh');
    assert.equal(plugin.getState().tasks.length, 2);
    assert.match(plugin.getState().error, /500/);
});

test('tick refreshes every five minutes, not more often', async () => {
    const {clock, plugin, source} = setup();
    await plugin.setClient(source);
    assert.equal(source.fetches, 1);

    clock.now = 4 * 60_000;
    await plugin.tick();
    assert.equal(source.fetches, 1);

    clock.now = 5 * 60_000;
    await plugin.tick();
    assert.equal(source.fetches, 2);
});

test('removing the client clears tasks', async () => {
    const {plugin, source} = setup();
    await plugin.setClient(source);
    await plugin.setClient(null);
    assert.equal(plugin.getState().status, 'needs-token');
    assert.deepEqual(plugin.getState().tasks, []);
});

test('notifies subscribers on changes', async () => {
    const {plugin, source} = setup();
    const events = [];
    plugin.subscribe(event => events.push(event));
    await plugin.setClient(source);
    assert.ok(events.length >= 1);
    assert.ok(events.every(event => event.type === 'changed'));
});

test('rejects unknown actions and completions without an id', async () => {
    const {plugin, source} = setup();
    await plugin.setClient(source);
    assert.throws(() => plugin.handleAction('explode'), /unknown todoist action: explode/);
    assert.throws(() => plugin.handleAction('complete', {}), /task id is required/);
});
