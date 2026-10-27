// ABOUTME: Unit tests for the plugin manifest the preferences window and loader read.
// ABOUTME: Checks ids are unique and every entry carries a title and description.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {PLUGIN_MANIFEST} from '../../src/plugins/manifest.js';

test('lists every shipped plugin once, with a title and description', () => {
    const ids = PLUGIN_MANIFEST.map(entry => entry.id);
    assert.deepEqual(ids, ['pomodoro', 'activities', 'privacy', 'todoist']);
    for (const entry of PLUGIN_MANIFEST) {
        assert.ok(entry.title, `${entry.id} has no title`);
        assert.ok(entry.description, `${entry.id} has no description`);
    }
});
