// ABOUTME: Everything the pomodoro shows inside GNOME Shell: compact, expanded and minimal views plus alerts.
// ABOUTME: Buttons send actions to the plugin; update(state) redraws from the plugin's state.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {verticalBox} from '../../shell/box.js';
import {ProgressBar} from '../../shell/progress-bar.js';
import {timerOptionsFromSettings} from './settings.js';
import {Phase} from './timer.js';

const PHASE_LABELS = {
    [Phase.WORK]: 'Focus',
    [Phase.SHORT_BREAK]: 'Short break',
    [Phase.LONG_BREAK]: 'Long break',
};

const FINISHED_MESSAGES = {
    [Phase.WORK]: 'Focus session done. Take a break.',
    [Phase.SHORT_BREAK]: 'Break is over. Back to focus.',
    [Phase.LONG_BREAK]: 'Long break is over. Back to focus.',
};

function controlButton(iconName, accessibleName, onClick) {
    const button = new St.Button({
        style_class: 'pomodoro-control',
        accessible_name: accessibleName,
        child: new St.Icon({icon_name: iconName, style_class: 'pomodoro-control-icon'}),
    });
    button.connect('clicked', onClick);
    return button;
}

// Phase-colored dot followed by the countdown; used in the pill and in the bubble.
function phaseClock() {
    const actor = new St.BoxLayout({style_class: 'pomodoro-compact-row'});
    const dot = new St.Widget({style_class: 'pomodoro-phase-dot', y_align: Clutter.ActorAlign.CENTER});
    const countdown = new St.Label({style_class: 'pomodoro-countdown', y_align: Clutter.ActorAlign.CENTER});
    actor.add_child(dot);
    actor.add_child(countdown);
    return {
        actor,
        update(state) {
            dot.set_style_class_name(`pomodoro-phase-dot ${state.phase}`);
            countdown.text = state.countdown;
        },
    };
}

export function createPomodoroShell(plugin, {settings}) {
    plugin.configure(timerOptionsFromSettings(settings));
    const settingsChangedId = settings.connect('changed',
        () => plugin.configure(timerOptionsFromSettings(settings)));

    const compact = verticalBox({style_class: 'pomodoro-compact'});
    const compactClock = phaseClock();
    const compactProgress = new ProgressBar();
    compact.add_child(compactClock.actor);
    compact.add_child(compactProgress.actor);

    const minimalClock = phaseClock();

    const expanded = verticalBox({style_class: 'pomodoro-expanded'});
    const phaseLabel = new St.Label({style_class: 'pomodoro-phase-label', x_align: Clutter.ActorAlign.CENTER});
    const bigCountdown = new St.Label({style_class: 'pomodoro-big-countdown', x_align: Clutter.ActorAlign.CENTER});
    const sessionsLabel = new St.Label({style_class: 'pomodoro-sessions', x_align: Clutter.ActorAlign.CENTER});
    const controls = new St.BoxLayout({style_class: 'pomodoro-controls', x_align: Clutter.ActorAlign.CENTER});
    const toggleButton = controlButton('media-playback-start-symbolic', 'Start or pause',
        () => plugin.handleAction('toggle'));
    controls.add_child(controlButton('view-refresh-symbolic', 'Reset', () => plugin.handleAction('reset')));
    controls.add_child(toggleButton);
    controls.add_child(controlButton('media-skip-forward-symbolic', 'Skip phase', () => plugin.handleAction('skip')));
    expanded.add_child(phaseLabel);
    expanded.add_child(bigCountdown);
    expanded.add_child(sessionsLabel);
    expanded.add_child(controls);

    const unsubscribe = plugin.subscribe(event => {
        if (event.type !== 'phase-finished')
            return;
        Main.notify(PHASE_LABELS[event.phase], FINISHED_MESSAGES[event.phase]);
        global.display.get_sound_player().play_from_theme('complete', 'Pomodoro phase finished', null);
    });

    return {
        compact,
        expanded,
        minimal: minimalClock.actor,
        update(state) {
            compactClock.update(state);
            minimalClock.update(state);
            compactProgress.update(state.progress, state.phase);
            phaseLabel.text = PHASE_LABELS[state.phase];
            bigCountdown.text = state.countdown;
            sessionsLabel.text = `${state.completedWorkSessions} focus sessions done`;
            toggleButton.child.icon_name = state.running
                ? 'media-playback-pause-symbolic'
                : 'media-playback-start-symbolic';
        },
        destroy() {
            settings.disconnect(settingsChangedId);
            unsubscribe();
            compact.destroy();
            expanded.destroy();
            minimalClock.actor.destroy();
        },
    };
}
