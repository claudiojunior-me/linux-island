// ABOUTME: Names the extension settings that hold pomodoro durations.
// ABOUTME: Shared by the shell part, which applies them, and the preferences window, which edits them.

export const POMODORO_SETTING_KEYS = Object.freeze({
    workMinutes: 'pomodoro-work-minutes',
    shortBreakMinutes: 'pomodoro-short-break-minutes',
    longBreakMinutes: 'pomodoro-long-break-minutes',
    sessionsBeforeLongBreak: 'pomodoro-sessions-before-long-break',
});

export function timerOptionsFromSettings(settings) {
    return Object.fromEntries(
        Object.entries(POMODORO_SETTING_KEYS).map(([option, key]) => [option, settings.get_int(key)]));
}
