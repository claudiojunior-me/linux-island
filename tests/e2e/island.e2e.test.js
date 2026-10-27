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
    assert.equal(cli('list'), 'pomodoro\nactivities\nprivacy\ntodoist');
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
    try {
        // The island redraws on the once-a-second tick, so it can trail the state by up to a second.
        await waitFor(() => islandTexts().some(text => /^24:5\d$/.test(text)), 'running countdown on the island');
        screenshot('island-running.png');
    } finally {
        island('Activate', 'pomodoro', 'reset');
    }
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
    const name = ${JSON.stringify(name)};
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
    try {
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
    } finally {
        cli('activities', 'end', '--id', 'task');
    }
    await waitFor(() => !bubbleState().visible, 'bubble gone when only the pomodoro is left');
});

test('privacy plugin loads its monitors and stays hidden while nothing is in use', () => {
    const privacy = state('privacy');
    assert.deepEqual(privacy.microphoneApps, []);
    assert.equal(privacy.screen, null);
    assert.notEqual(cli('foreground'), 'privacy');
});

test('without a token the Todoist plugin waits and stays hidden', () => {
    const todoist = state('todoist');
    assert.equal(todoist.status, 'needs-token');
    assert.notEqual(cli('foreground'), 'todoist');
});

test('a real Todoist task due today shows in the pill beside the pomodoro bubble and completes',
    {skip: !process.env.TODOIST_API_TOKEN && 'TODOIST_API_TOKEN not set'}, async () => {
        const token = process.env.TODOIST_API_TOKEN;
        const api = async (method, apiPath, body) => {
            const response = await fetch(`https://api.todoist.com/api/v1${apiPath}`, {
                method,
                headers: {'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json'},
                body: body ? JSON.stringify(body) : undefined,
            });
            assert.ok(response.ok, `${method} ${apiPath} failed: ${response.status}`);
            return response.status === 204 ? null : response.json();
        };
        const title = `linux-island e2e ${Date.now()}`;
        const created = await api('POST', '/tasks', {content: title, due_string: 'today', priority: 4});
        try {
            setSetting('todoist-api-token', token);
            await waitFor(() => state('todoist').tasks.some(task => task.id === created.id), 'task loaded');
            await waitFor(() => islandTexts().includes(title), 'task title on the island');
            assert.equal(cli('foreground'), 'todoist');
            assert.ok(bubbleState().texts.includes('25:00'), 'pomodoro missing from the bubble');
            await sleep(400);
            screenshot('island-todoist.png');

            cli('todoist', 'complete', '--id', created.id);
            await waitFor(() => !state('todoist').tasks.some(task => task.id === created.id), 'task completed');
            assert.equal(state('todoist').error, null);
        } finally {
            setSetting('todoist-api-token', '');
            await api('DELETE', `/tasks/${created.id}`);
        }
    });

const islandVisible = () => shellEval(`(() => {
    const group = Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island');
    return group.visible;
})()`);

const settingsButtonVisible = () => shellEval(`(() => {
    const group = Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island');
    let found = null;
    const walk = actor => {
        if (actor.accessible_name === 'Linux Island settings') found = actor;
        actor.get_children().forEach(walk);
    };
    walk(group);
    return found !== null && found.mapped;
})()`);

test('disabling mini-apps unloads them live and enabling brings them back', async () => {
    try {
        setSetting('enabled-plugins', "['pomodoro', 'activities']");
        await waitFor(() => cli('list') === 'pomodoro\nactivities', 'privacy and todoist unloaded');
        assert.throws(() => cli('state', 'todoist'), /unknown plugin: todoist/);

        setSetting('enabled-plugins', "['activities']");
        await waitFor(() => !islandVisible(), 'island hidden with nothing to show');

        setSetting('enabled-plugins', "['pomodoro', 'activities']");
        await waitFor(() => islandVisible() && islandTexts().includes('25:00'), 'pomodoro back in the pill');
    } finally {
        setSetting('enabled-plugins', "['pomodoro', 'activities', 'privacy', 'todoist']");
        await waitFor(() => cli('list').split('\n').length === 4, 'all plugins loaded again');
    }
});

test('the expanded pill offers a settings button, collapsed it does not', async () => {
    assert.equal(settingsButtonVisible(), false);
    clickIslandPart('header');
    await waitFor(() => settingsButtonVisible(), 'settings button when expanded');
    await sleep(400);
    screenshot('island-expanded-settings.png');
    clickIslandPart('header');
    await waitFor(() => !settingsButtonVisible(), 'settings button hidden when collapsed');
});

// Real input through virtual devices, so events go through the same grabs and focus as a user's.
// One pointer lives for the whole run. Its first motions can land only partly, so each move is sent twice.
const virtualPointer = `(() => {
    if (!global.linuxIslandTestPointer) {
        const seat = imports.gi.Clutter.get_default_backend().get_default_seat();
        global.linuxIslandTestPointer = seat.create_virtual_device(imports.gi.Clutter.InputDeviceType.POINTER_DEVICE);
    }
    return global.linuxIslandTestPointer;
})()`;

async function movePointer(where) {
    for (let attempt = 0; attempt < 2; attempt++) {
        shellEval(`(() => {
            const group = Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island');
            const pill = group.get_children().find(a => a.name === 'linux-island-pill');
            const [pillX, pillY] = pill.get_transformed_position();
            const [x, y] = ${where === 'pill' ? '[pillX + pill.width / 2, pillY + pill.height / 2]' : '[40, global.stage.height - 40]'};
            ${virtualPointer}.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(), x, y);
            return true;
        })()`);
        await sleep(150);
    }
}

async function scrollPill(direction) {
    await movePointer('pill');
    shellEval(`(() => {
        const Clutter = imports.gi.Clutter;
        ${virtualPointer}.notify_discrete_scroll(imports.gi.GLib.get_monotonic_time(),
            Clutter.ScrollDirection.${direction}, Clutter.ScrollSource.WHEEL);
        return true;
    })()`);
}

async function clickOutsideIsland() {
    await movePointer('outside');
    shellEval(`(() => {
        const Clutter = imports.gi.Clutter;
        const pointer = ${virtualPointer};
        const now = imports.gi.GLib.get_monotonic_time();
        pointer.notify_button(now, Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
        pointer.notify_button(now, Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
        return true;
    })()`);
}

const pressKey = name => shellEval(`(() => {
    const seat = imports.gi.Clutter.get_default_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(imports.gi.Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const now = () => imports.gi.GLib.get_monotonic_time();
    keyboard.notify_keyval(now(), imports.gi.Clutter.KEY_${name}, imports.gi.Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(now(), imports.gi.Clutter.KEY_${name}, imports.gi.Clutter.KeyState.RELEASED);
    return true;
})()`);

const pillShows = text => islandTexts().includes(text);

// Scrolling over the collapsed pill is checked by hand in scripts/dev.sh: the headless shell delivers
// virtual pointer events only while the island holds a grab. The expanded tests below run the same handler.

test('arrow keys page through the expanded cards and Escape collapses', async () => {
    clickIslandPart('header');
    await waitFor(() => settingsButtonVisible(), 'expanded pill');
    pressKey('Right');
    await waitFor(() => pillShows('No live activities'), 'activities card expanded');
    assert.equal(settingsButtonVisible(), true);
    pressKey('Down');
    await waitFor(() => pillShows('No mic, camera or screen in use'), 'privacy card expanded');
    pressKey('Up');
    pressKey('Left');
    await waitFor(() => pillShows('Focus'), 'pomodoro card expanded');
    pressKey('Escape');
    await waitFor(() => !settingsButtonVisible(), 'collapsed by Escape');
});

test('scrolling pages through the expanded cards too', async () => {
    clickIslandPart('header');
    await waitFor(() => settingsButtonVisible(), 'expanded pill');
    try {
        await scrollPill('DOWN');
        await waitFor(() => pillShows('No live activities'), 'activities card expanded');
        await scrollPill('UP');
        await waitFor(() => pillShows('Focus'), 'pomodoro card expanded');
    } finally {
        pressKey('Escape');
    }
    await waitFor(() => !settingsButtonVisible(), 'collapsed');
});

test('clicking outside the expanded island collapses it', async () => {
    clickIslandPart('header');
    await waitFor(() => settingsButtonVisible(), 'expanded pill');
    await clickOutsideIsland();
    await waitFor(() => !settingsButtonVisible(), 'collapsed by a click outside');
});

test('a plugin with higher priority becoming active takes over a chosen card', async () => {
    clickIslandPart('header');
    await waitFor(() => settingsButtonVisible(), 'expanded pill');
    pressKey('Left');
    await waitFor(() => pillShows('Todoist · add a token in settings'), 'todoist card chosen');
    pressKey('Escape');
    await waitFor(() => !settingsButtonVisible(), 'collapsed on the todoist card');
    cli('activities', 'push', '--id', 'takeover', '--title', 'Deploy finished');
    try {
        await waitFor(() => pillShows('Deploy finished'), 'activity takes over the pill');
    } finally {
        cli('activities', 'end', '--id', 'takeover');
    }
    await waitFor(() => pillShows('25:00'), 'pomodoro back once the activity ends');
});
