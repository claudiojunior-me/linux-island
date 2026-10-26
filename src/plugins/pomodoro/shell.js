// ABOUTME: Everything the pomodoro shows inside GNOME Shell: compact and expanded island views plus alerts.
// ABOUTME: Buttons send actions to the plugin; update(state) redraws from the plugin's state.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {verticalBox} from '../../shell/box.js';
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

// A thin bar whose fill follows the progress of the current phase.
class ProgressBar {
    constructor(styleClass) {
        this._progress = 0;
        this.actor = new St.Widget({style_class: `pomodoro-progress-track ${styleClass}`, x_expand: true});
        this._fill = new St.Widget({style_class: 'pomodoro-progress-fill'});
        this.actor.add_child(this._fill);
        this.actor.connect('notify::width', () => this._redraw());
    }

    update(progress, phase) {
        this._progress = progress;
        this._fill.set_style_class_name(`pomodoro-progress-fill ${phase}`);
        this._redraw();
    }

    _redraw() {
        this._fill.width = Math.round(this.actor.width * this._progress);
    }
}

export function createPomodoroShell(plugin, {settings}) {
    plugin.configure(timerOptionsFromSettings(settings));
    const settingsChangedId = settings.connect('changed',
        () => plugin.configure(timerOptionsFromSettings(settings)));

    const compact = verticalBox({style_class: 'pomodoro-compact'});
    const compactRow = new St.BoxLayout({style_class: 'pomodoro-compact-row'});
    const phaseDot = new St.Widget({style_class: 'pomodoro-phase-dot', y_align: Clutter.ActorAlign.CENTER});
    const compactCountdown = new St.Label({style_class: 'pomodoro-countdown', y_align: Clutter.ActorAlign.CENTER});
    const compactProgress = new ProgressBar('compact');
    compactRow.add_child(phaseDot);
    compactRow.add_child(compactCountdown);
    compact.add_child(compactRow);
    compact.add_child(compactProgress.actor);

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
        update(state) {
            phaseDot.set_style_class_name(`pomodoro-phase-dot ${state.phase}`);
            compactCountdown.text = state.countdown;
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
        },
    };
}
