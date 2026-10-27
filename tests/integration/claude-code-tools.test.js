// ABOUTME: Integration tests for the Claude Code hook installer and hook script as real processes.
// ABOUTME: Uses a temporary CLAUDE_CONFIG_DIR and a session bus address where no island is listening.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const INSTALLER = fileURLToPath(new URL('../../scripts/install-claude-code-hooks.js', import.meta.url));
const HOOK = fileURLToPath(new URL('../../bin/claude-code-hook', import.meta.url));
const HOOK_COMMAND = JSON.stringify(HOOK);

function tempConfigDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-island-claude-'));
    return {dir, settingsPath: path.join(dir, 'settings.json'), cleanup: () => fs.rmSync(dir, {recursive: true})};
}

const runInstaller = (configDir, ...args) => spawnSync(INSTALLER, args, {
    encoding: 'utf8', env: {...process.env, CLAUDE_CONFIG_DIR: configDir},
});

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('installer adds hooks next to existing ones, backs up, and is idempotent', () => {
    const {dir, settingsPath, cleanup} = tempConfigDir();
    try {
        const original = {model: 'opus', hooks: {Stop: [{hooks: [{type: 'command', command: 'notify-send done'}]}]}};
        fs.writeFileSync(settingsPath, JSON.stringify(original));

        const first = runInstaller(dir);
        assert.equal(first.status, 0, first.stderr);
        assert.match(first.stdout, /Added island hooks/);
        const installed = readJson(settingsPath);
        assert.equal(installed.model, 'opus');
        assert.equal(installed.hooks.Stop.length, 2);
        assert.equal(installed.hooks.Stop[1].hooks[0].command, HOOK_COMMAND);
        assert.deepEqual(readJson(`${settingsPath}.linux-island-backup`), original);

        const second = runInstaller(dir);
        assert.equal(second.status, 0, second.stderr);
        assert.match(second.stdout, /already has the island hooks/);
        assert.deepEqual(readJson(settingsPath), installed);

        const removed = runInstaller(dir, '--uninstall');
        assert.equal(removed.status, 0, removed.stderr);
        assert.deepEqual(readJson(settingsPath), original);
    } finally {
        cleanup();
    }
});

test('installer creates settings when the file does not exist', () => {
    const {dir, settingsPath, cleanup} = tempConfigDir();
    try {
        const result = runInstaller(dir);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readJson(settingsPath).hooks.UserPromptSubmit[0].hooks[0].command, HOOK_COMMAND);
        assert.equal(fs.existsSync(`${settingsPath}.linux-island-backup`), false);
    } finally {
        cleanup();
    }
});

test('hook stays silent and succeeds when the island is unreachable or input is garbage', () => {
    const env = {...process.env, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent/linux-island-test'};
    for (const input of [
        JSON.stringify({session_id: 'abc', cwd: '/tmp/x', hook_event_name: 'UserPromptSubmit'}),
        'not json',
        '',
    ]) {
        const started = Date.now();
        const result = spawnSync(HOOK, [], {input, encoding: 'utf8', env});
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, '');
        assert.ok(Date.now() - started < 3000, 'hook took too long');
    }
});
