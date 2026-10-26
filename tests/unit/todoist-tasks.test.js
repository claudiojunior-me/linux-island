// ABOUTME: Unit tests for normalizing Todoist API tasks and ordering them for the island.
// ABOUTME: Inputs follow the Todoist API v1 wire format (snake_case, priority 4 = p1).
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {normalizeTask, orderTasks} from '../../src/plugins/todoist/tasks.js';

const apiTask = (id, {priority = 1, date = '2026-10-26', datetime = null, childOrder = 1} = {}) => ({
    id, content: `Task ${id}`, priority, child_order: childOrder, description: '',
    due: {date, datetime, string: 'today', is_recurring: false},
});

test('normalizes the fields the island needs', () => {
    assert.deepEqual(normalizeTask(apiTask('1', {priority: 4, datetime: '2026-10-26T14:00:00Z'})), {
        id: '1', title: 'Task 1', priority: 4, dueDate: '2026-10-26', dueTime: '2026-10-26T14:00:00Z', order: 1,
    });
});

test('handles tasks without a due date', () => {
    const task = normalizeTask({...apiTask('1'), due: null});
    assert.equal(task.dueDate, null);
    assert.equal(task.dueTime, null);
});

test('orders by priority first', () => {
    const tasks = ['a', 'b', 'c'].map((id, i) => normalizeTask(apiTask(id, {priority: i + 2})));
    assert.deepEqual(orderTasks(tasks).map(task => task.id), ['c', 'b', 'a']);
});

test('within a priority, timed tasks by time, then older dates, then untimed by order', () => {
    const tasks = [
        normalizeTask(apiTask('untimed-2', {childOrder: 2})),
        normalizeTask(apiTask('late', {datetime: '2026-10-26T18:00:00Z'})),
        normalizeTask(apiTask('untimed-1', {childOrder: 1})),
        normalizeTask(apiTask('overdue', {date: '2026-10-20'})),
        normalizeTask(apiTask('early', {datetime: '2026-10-26T09:00:00Z'})),
    ];
    assert.deepEqual(orderTasks(tasks).map(task => task.id), ['early', 'late', 'overdue', 'untimed-1', 'untimed-2']);
});

test('ordering does not modify the input', () => {
    const tasks = [normalizeTask(apiTask('a')), normalizeTask(apiTask('b', {priority: 4}))];
    orderTasks(tasks);
    assert.deepEqual(tasks.map(task => task.id), ['a', 'b']);
});

test('due label shows the local time for timed tasks, Overdue for past dates, nothing otherwise', async () => {
    const {dueLabel} = await import('../../src/plugins/todoist/tasks.js');
    const task = (dueDate, dueTime = null) => ({dueDate, dueTime});
    assert.equal(dueLabel(task('2026-10-26', '2026-10-26T09:05:00'), '2026-10-26'), '09:05');
    assert.equal(dueLabel(task('2026-10-20'), '2026-10-26'), 'Overdue');
    assert.equal(dueLabel(task('2026-10-20', '2026-10-20T09:00:00'), '2026-10-26'), 'Overdue');
    assert.equal(dueLabel(task('2026-10-26'), '2026-10-26'), '');
    assert.equal(dueLabel(task(null), '2026-10-26'), '');
});
