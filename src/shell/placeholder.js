// ABOUTME: Dimmed one-line label a plugin card shows in the pill when it has nothing to report.
// ABOUTME: Shared so every idle card looks the same.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export function placeholderLabel(text) {
    return new St.Label({style_class: 'island-placeholder', text, y_align: Clutter.ActorAlign.CENTER});
}
