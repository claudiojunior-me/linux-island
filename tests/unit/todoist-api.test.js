// ABOUTME: Unit tests for the Todoist API v1 client logic: URLs, auth header, pagination and errors.
// ABOUTME: The HTTP transport is a recording stand-in; the real API is exercised in the integration suite.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {TodoistApi} from '../../src/plugins/todoist/api.js';

function recordingTransport(responses) {
    const requests = [];
    const http = async request => {
        requests.push(request);
        return responses.shift();
    };
    return {http, requests};
}

const ok = body => ({status: 200, body: JSON.stringify(body)});

test('fetches today and overdue tasks across pages with the bearer token', async () => {
    const {http, requests} = recordingTransport([
        ok({results: [{id: '1'}], next_cursor: 'abc'}),
        ok({results: [{id: '2'}], next_cursor: null}),
    ]);
    const api = new TodoistApi({token: 'secret', http});

    assert.deepEqual(await api.fetchTodayTasks(), [{id: '1'}, {id: '2'}]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].url, 'https://api.todoist.com/api/v1/tasks/filter?query=today%20%7C%20overdue&limit=200');
    assert.equal(requests[1].url, 'https://api.todoist.com/api/v1/tasks/filter?query=today%20%7C%20overdue&limit=200&cursor=abc');
    assert.deepEqual(requests[0].headers, {Authorization: 'Bearer secret'});
});

test('closes a task with POST to its close endpoint', async () => {
    const {http, requests} = recordingTransport([{status: 204, body: ''}]);
    await new TodoistApi({token: 't', http}).closeTask('42');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].url, 'https://api.todoist.com/api/v1/tasks/42/close');
});

test('turns error statuses into errors that name the status', async () => {
    const {http} = recordingTransport([{status: 401, body: 'Unauthorized'}]);
    await assert.rejects(new TodoistApi({token: 'bad', http}).fetchTodayTasks(), /Todoist API 401/);
});

test('requires a token', () => {
    assert.throws(() => new TodoistApi({token: '', http: async () => ({})}), /token/);
});
