// ABOUTME: Island views for live activities: the top activity in compact form, every activity when expanded.
// ABOUTME: Expanded rows have a dismiss button that ends the activity.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {verticalBox} from '../../shell/box.js';
import {ProgressBar} from '../../shell/progress-bar.js';

// An icon when the activity names one, otherwise a dot in the accent color.
function marker(activity) {
    if (activity.icon)
        return new St.Icon({icon_name: activity.icon, style_class: `activity-icon ${activity.accent}`});
    return new St.Widget({style_class: `activity-dot ${activity.accent}`, y_align: Clutter.ActorAlign.CENTER});
}

function activityRow(plugin, activity) {
    const row = new St.BoxLayout({style_class: 'activity-row'});
    row.add_child(marker(activity));

    const text = verticalBox({style_class: 'activity-text', x_expand: true});
    text.add_child(new St.Label({style_class: 'activity-title', text: activity.title}));
    if (activity.subtitle)
        text.add_child(new St.Label({style_class: 'activity-subtitle', text: activity.subtitle}));
    if (activity.progress !== null) {
        const progress = new ProgressBar();
        progress.update(activity.progress, activity.accent);
        text.add_child(progress.actor);
    }
    row.add_child(text);

    const dismiss = new St.Button({
        style_class: 'activity-dismiss',
        accessible_name: `Dismiss ${activity.title}`,
        y_align: Clutter.ActorAlign.CENTER,
        child: new St.Icon({icon_name: 'window-close-symbolic', style_class: 'activity-dismiss-icon'}),
    });
    dismiss.connect('clicked', () => plugin.handleAction('end', {id: activity.id}));
    row.add_child(dismiss);
    return row;
}

export function createActivitiesShell(plugin) {
    const compact = verticalBox({style_class: 'activity-compact'});
    const expanded = verticalBox({style_class: 'activity-list'});

    return {
        compact,
        expanded,
        update({activities}) {
            compact.destroy_all_children();
            expanded.destroy_all_children();
            const [top] = activities;
            if (!top)
                return;

            const line = new St.BoxLayout({style_class: 'activity-compact-row'});
            line.add_child(marker(top));
            line.add_child(new St.Label({
                style_class: 'activity-title', text: top.title, y_align: Clutter.ActorAlign.CENTER,
            }));
            if (top.subtitle) {
                line.add_child(new St.Label({
                    style_class: 'activity-subtitle', text: top.subtitle, y_align: Clutter.ActorAlign.CENTER,
                }));
            }
            if (activities.length > 1) {
                line.add_child(new St.Label({
                    style_class: 'activity-more', text: `+${activities.length - 1}`, y_align: Clutter.ActorAlign.CENTER,
                }));
            }
            compact.add_child(line);
            if (top.progress !== null) {
                const progress = new ProgressBar();
                progress.update(top.progress, top.accent);
                compact.add_child(progress.actor);
            }

            for (const activity of activities)
                expanded.add_child(activityRow(plugin, activity));
        },
        destroy() {
            compact.destroy();
            expanded.destroy();
        },
    };
}
