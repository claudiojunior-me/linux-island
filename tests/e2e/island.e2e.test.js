// ABOUTME: End-to-end tests that drive the extension inside a real GNOME Shell over D-Bus.
// ABOUTME: Run through tests/e2e/run.sh, which starts the headless shell these tests talk to.
import {test, before} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import path from 'node:path';

const BUS_NAME = 'io.github.claudiojunior_me.LinuxIsland';
const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.linux-island';
const OBJECT_PATH = '/io/github/claudiojunior_me/LinuxIsland';

function gdbusCall(dest, objectPath, method, ...args) {
    return execFileSync('gdbus', [
        'call', '--session', '--dest', dest, '--object-path', objectPath, '--method', method, ...args,
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

const island = (method, ...args) => gdbusCall(BUS_NAME, OBJECT_PATH, `${BUS_NAME}.${method}`, ...args);

// gdbus prints a single string result as ('value',)
const unwrapString = output => output.match(/^\('(.*)',\)$/s)[1];

const state = () => JSON.parse(unwrapString(island('GetState', 'pomodoro')));

// Runs JavaScript inside the shell; needs gnome-shell --unsafe-mode.
function shellEval(code) {
    const output = gdbusCall('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Eval', code);
    const [, ok, result] = output.match(/^\((true|false), '(.*)'\)$/s);
    assert.equal(ok, 'true', `Eval failed: ${result}`);
    return JSON.parse(result);
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

test('exposes the pomodoro plugin as foreground', () => {
    assert.equal(island('ListPlugins'), "(['pomodoro'],)");
    assert.equal(unwrapString(island('GetForeground')), 'pomodoro');
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
    const labels = shellEval(`(() => {
        const texts = [];
        const walk = actor => {
            if (actor.text !== undefined && actor.text !== null) texts.push(actor.text);
            actor.get_children().forEach(walk);
        };
        walk(Main.layoutManager.uiGroup.get_children().find(a => a.name === 'linux-island'));
        return texts;
    })()`);
    assert.ok(labels.includes(state().countdown), `countdown missing from island: ${labels}`);

    const screenshot = path.join(process.env.E2E_SCREENSHOT_DIR, 'island-running.png');
    gdbusCall('org.gnome.Shell.Screenshot', '/org/gnome/Shell/Screenshot',
        'org.gnome.Shell.Screenshot.Screenshot', 'false', 'false', screenshot);
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
