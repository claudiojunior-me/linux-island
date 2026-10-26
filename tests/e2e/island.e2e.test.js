// ABOUTME: End-to-end tests that drive the extension inside a real GNOME Shell over D-Bus.
// ABOUTME: Run through tests/e2e/run.sh, which starts the headless shell these tests talk to.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {BUS_NAME, OBJECT_PATH} from '../../src/core/bus-address.js';
import {parseGdbusString} from '../../src/cli/command.js';

const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.linux-island';
const ISLAND_CLI = fileURLToPath(new URL('../../bin/island', import.meta.url));

function gdbusCall(dest, objectPath, method, ...args) {
    return execFileSync('gdbus', [
        'call', '--session', '--dest', dest, '--object-path', objectPath, '--method', method, ...args,
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

const island = (method, ...args) => gdbusCall(BUS_NAME, OBJECT_PATH, `${BUS_NAME}.${method}`, ...args);

const cli = (...args) => execFileSync(ISLAND_CLI, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

const state = (pluginId = 'pomodoro') => JSON.parse(parseGdbusString(island('GetState', pluginId)));

// Runs JavaScript inside the shell; needs gnome-shell --unsafe-mode.
function shellEval(code) {
    const output = gdbusCall('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Eval', code);
    assert.ok(output.startsWith('(true,'), `Eval failed: ${output}`);
    return JSON.parse(parseGdbusString(output));
}

// Every label text inside the island actor, in tree order.
const islandTexts = () => shellEval(`(() => {
    const texts = [];
    const walk = actor => {
        if (actor.text !== undefined && actor.text !== null) texts.push(actor.text);
        actor.get_children().forEach(walk);
    };
    walk(Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island'));
    return texts;
})()`);

function screenshot(name) {
    gdbusCall('org.gnome.Shell.Screenshot', '/org/gnome/Shell/Screenshot',
        'org.gnome.Shell.Screenshot.Screenshot', 'false', 'false',
        path.join(process.env.E2E_SCREENSHOT_DIR, name));
}

function setSetting(key, value) {
    execFileSync('gsettings', ['--schemadir', process.env.E2E_SCHEMA_DIR, 'set', SETTINGS_SCHEMA, key, value]);
}

async function waitFor(check, description) {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (check())
            return;
        await sleep(100);
    }
    throw new Error(`timed out waiting for ${description}`);
}

before(async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
        try {
            island('ListPlugins');
            return;
        } catch {
            await sleep(500);
        }
    }
    throw new Error(`${BUS_NAME} never appeared on the session bus`);
});

test('exposes the plugins with pomodoro as foreground', () => {
    assert.equal(cli('list'), 'pomodoro\nactivities');
    assert.equal(cli('foreground'), 'pomodoro');
});

test('island is on screen, centered below the top bar', () => {
    const geometry = shellEval(`(() => {
        const actor = Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island');
        const [x, y] = actor.get_transformed_position();
        return {
            visible: actor.visible && actor.mapped,
            x, y, width: actor.width,
            monitorWidth: Main.layoutManager.primaryMonitor.width,
            panelBottom: Main.layoutManager.panelBox.y + Main.layoutManager.panelBox.height,
        };
    })()`);

    assert.equal(geometry.visible, true);
    assert.ok(geometry.y >= geometry.panelBottom, 'island overlaps the top bar');
    const center = geometry.x + geometry.width / 2;
    assert.ok(Math.abs(center - geometry.monitorWidth / 2) <= 1, `island not centered: ${center}`);
});

test('pomodoro runs, pauses, skips and resets inside the shell', async () => {
    assert.equal(state().countdown, '25:00');

    island('Activate', 'pomodoro', 'toggle');
    await sleep(2200);
    const running = state();
    assert.equal(running.running, true);
    assert.ok(running.remainingMs < running.totalMs, 'timer did not count down');

    island('Activate', 'pomodoro', 'toggle');
    assert.equal(state().running, false);

    island('Activate', 'pomodoro', 'skip');
    assert.equal(state().phase, 'short-break');

    island('Activate', 'pomodoro', 'reset');
    assert.equal(state().phase, 'work');
    assert.equal(state().countdown, '25:00');
});

test('island shows the running countdown', async () => {
    island('Activate', 'pomodoro', 'start');
    await sleep(1500);
    const texts = islandTexts();
    assert.ok(texts.includes(state().countdown), `countdown missing from island: ${texts}`);
    screenshot('island-running.png');
    island('Activate', 'pomodoro', 'reset');
});

test('unknown plugins and actions return D-Bus errors', () => {
    assert.throws(() => island('GetState', 'nope'), /unknown plugin: nope/);
    assert.throws(() => island('Activate', 'pomodoro', 'explode'), /unknown pomodoro action: explode/);
});

test('changing the work duration setting updates the idle countdown', async () => {
    setSetting('pomodoro-work-minutes', '1');
    await waitFor(() => state().countdown === '01:00', 'countdown 01:00');

    setSetting('pomodoro-work-minutes', '25');
    await waitFor(() => state().countdown === '25:00', 'countdown 25:00');
});

test('a live activity pushed from the CLI takes over the island until it ends', async () => {
    cli('activities', 'push', '--id', 'build', '--title', 'cargo build', '--subtitle', 'compiling', '--progress', '0.4');
    assert.equal(cli('foreground'), 'activities');
    await waitFor(() => islandTexts().includes('cargo build'), 'activity title on the island');
    await sleep(400);
    screenshot('island-activity.png');

    cli('activities', 'end', '--id', 'build');
    assert.equal(cli('foreground'), 'pomodoro');
    await waitFor(() => !islandTexts().includes('cargo build'), 'activity gone from the island');
});

test('a live activity with a timeout ends by itself', async () => {
    cli('activities', 'push', '--id', 'done', '--title', 'Done', '--accent', 'success', '--timeout-seconds', '1');
    assert.equal(state('activities').activities.length, 1);
    await sleep(2500);
    assert.deepEqual(state('activities'), {activities: []});
});

test('the CLI reports invalid activities as errors', () => {
    assert.throws(() => cli('activities', 'push', '--id', 'x'), /activity title is required/);
});

test('the Claude Code hook mirrors a session on the island', async () => {
    const hook = fileURLToPath(new URL('../../bin/claude-code-hook', import.meta.url));
    const event = name => execFileSync(hook, [], {
        input: JSON.stringify({session_id: 'e2e-session', cwd: '/home/me/linux-island', hook_event_name: name}),
    });

    event('UserPromptSubmit');
    await waitFor(() => islandTexts().includes('Claude · linux-island'), 'Claude card on the island');
    event('Notification');
    assert.equal(state('activities').activities[0].accent, 'attention');
    event('SessionEnd');
    assert.deepEqual(state('activities'), {activities: []});
});

const clickIslandPart = name => shellEval(`(() => {
    const group = Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island');
    const pill = group.get_children().find(a => a.name === 'linux-island-pill');
    const part = name === 'header' ? pill.get_first_child() : group.get_children().find(a => a.name === name);
    part.emit('clicked', 1);
    return true;
})()`);

const bubbleState = () => shellEval(`(() => {
    const group = Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island');
    const bubble = group.get_children().find(a => a.name === 'linux-island-bubble');
    const texts = [];
    const walk = actor => {
        if (actor.text !== undefined && actor.text !== null) texts.push(actor.text);
        actor.get_children().forEach(walk);
    };
    walk(bubble);
    return {visible: bubble.visible, texts};
})()`);

test('an activity and the idle pomodoro share the island: pill and bubble', async () => {
    assert.equal(bubbleState().visible, false);

    cli('activities', 'push', '--id', 'task', '--title', 'Write report');
    await waitFor(() => bubbleState().visible, 'bubble to appear');
    assert.ok(bubbleState().texts.includes('25:00'), `pomodoro missing from bubble: ${bubbleState().texts}`);
    await sleep(400);
    screenshot('island-two-slots.png');

    clickIslandPart('linux-island-bubble');
    await waitFor(() => islandTexts().includes('Focus'), 'pomodoro expanded in the pill');
    assert.equal(bubbleState().visible, false);
    await sleep(400);
    screenshot('island-bubble-expanded.png');

    clickIslandPart('header');
    await waitFor(() => bubbleState().visible, 'bubble back after collapsing');

    cli('activities', 'end', '--id', 'task');
    await waitFor(() => !bubbleState().visible, 'bubble gone when only the pomodoro is left');
});
