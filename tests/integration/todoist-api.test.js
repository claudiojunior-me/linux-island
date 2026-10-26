// ABOUTME: Integration test against the real Todoist API with a throwaway task created and deleted by the test.
// ABOUTME: Needs TODOIST_API_TOKEN; reported as skipped without it.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {TodoistApi} from '../../src/plugins/todoist/api.js';
import {TodoistPlugin} from '../../src/plugins/todoist/plugin.js';

const token = process.env.TODOIST_API_TOKEN;

const fetchHttp = async ({method, url, headers}) => {
    const response = await fetch(url, {method, headers});
    return {status: response.status, body: await response.text()};
};

async function todoist(method, path, body) {
    const response = await fetch(`https://api.todoist.com/api/v1${path}`, {
        method,
        headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
        body: body ? JSON.stringify(body) : undefined,
    });
    assert.ok(response.ok, `${method} ${path} failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
}

test('plugin loads a real task due today and completes it', {skip: !token && 'TODOIST_API_TOKEN not set'}, async () => {
    const created = await todoist('POST', '/tasks', {
        content: `linux-island integration ${Date.now()}`, due_string: 'today', priority: 4,
    });
    try {
        const plugin = new TodoistPlugin();
        await plugin.setClient(new TodoistApi({token, http: fetchHttp}));
        const loaded = plugin.getState();
        assert.equal(loaded.error, null);
        assert.ok(loaded.tasks.some(task => task.id === created.id), 'created task not listed for today');

        await plugin.handleAction('complete', {id: created.id});
        assert.equal(plugin.getState().error, null);
        await plugin.handleAction('refresh');
        assert.ok(!plugin.getState().tasks.some(task => task.id === created.id), 'completed task still listed');
    } finally {
        await todoist('DELETE', `/tasks/${created.id}`);
    }
});
