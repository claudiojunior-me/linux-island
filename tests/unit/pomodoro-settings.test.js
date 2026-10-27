// ABOUTME: Unit tests for reading pomodoro timer options out of extension settings.
// ABOUTME: Uses a plain object with get_int, the only GSettings method the reader touches.
import {test} from 'node:test';
import assert from 'node:assert/strict';

import {POMODORO_SETTING_KEYS, timerOptionsFromSettings} from '../../src/plugins/pomodoro/settings.js';

test('maps every timer option to its settings key', () => {
    const values = {
        'pomodoro-work-minutes': 50,
        'pomodoro-short-break-minutes': 10,
        'pomodoro-long-break-minutes': 30,
        'pomodoro-sessions-before-long-break': 3,
    };
    const settings = {get_int: key => values[key]};

    assert.deepEqual(timerOptionsFromSettings(settings), {
        workMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 30,
        sessionsBeforeLongBreak: 3,
    });
    assert.deepEqual(Object.values(POMODORO_SETTING_KEYS).sort(), Object.keys(values).sort());
});
