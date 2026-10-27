// ABOUTME: Todoist inside GNOME Shell: reads the API token setting and draws the current task and today's list.
// ABOUTME: Expanded rows have a checkbox that completes the task.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {verticalBox} from '../../shell/box.js';
import {HttpClient} from '../../shell/http.js';
import {placeholderLabel} from '../../shell/placeholder.js';
import {TodoistApi} from './api.js';
import {TODOIST_TOKEN_SETTING} from './settings.js';
import {dueLabel} from './tasks.js';

const LISTED_TASKS = 8;

// Pill text while there is no current task, by plugin status.
const IDLE_TEXTS = {
    'needs-token': 'Todoist · add a token in settings',
    'loading': 'Todoist · loading…',
    'ready': 'Todoist · no tasks today',
};

const taskIcon = (task, styleClass) => new St.Icon({
    icon_name: 'checkbox-symbolic',
    style_class: `${styleClass} todoist-priority-${task.priority}`,
    y_align: Clutter.ActorAlign.CENTER,
});

function taskRow(plugin, task, today, isCurrent) {
    const row = new St.BoxLayout({style_class: isCurrent ? 'todoist-row current' : 'todoist-row'});
    const check = new St.Button({
        style_class: 'todoist-check',
        accessible_name: `Complete ${task.title}`,
        child: taskIcon(task, 'todoist-check-icon'),
    });
    check.connect('clicked', () => plugin.handleAction('complete', {id: task.id}));
    row.add_child(check);
    row.add_child(new St.Label({
        style_class: 'todoist-row-title', text: task.title, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
    }));
    const due = dueLabel(task, today);
    if (due) {
        row.add_child(new St.Label({
            style_class: due === 'Overdue' ? 'todoist-due overdue' : 'todoist-due', text: due,
            y_align: Clutter.ActorAlign.CENTER,
        }));
    }
    return row;
}

export function createTodoistShell(plugin, {settings}) {
    const http = new HttpClient();
    const applyToken = () => {
        const token = settings.get_string(TODOIST_TOKEN_SETTING).trim();
        plugin.setClient(token ? new TodoistApi({token, http: http.request}) : null);
    };
    const tokenChangedId = settings.connect(`changed::${TODOIST_TOKEN_SETTING}`, applyToken);
    applyToken();

    const compact = new St.BoxLayout({style_class: 'todoist-compact'});
    const minimal = new St.BoxLayout({style_class: 'todoist-compact'});
    const expanded = verticalBox({style_class: 'todoist-list'});

    return {
        compact,
        expanded,
        minimal,
        update({status, tasks, current, error}) {
            compact.destroy_all_children();
            minimal.destroy_all_children();
            expanded.destroy_all_children();
            if (!current) {
                compact.add_child(placeholderLabel(IDLE_TEXTS[status]));
                if (error)
                    expanded.add_child(new St.Label({style_class: 'todoist-error', text: error}));
                return;
            }

            compact.add_child(taskIcon(current, 'todoist-icon'));
            compact.add_child(new St.Label({
                style_class: 'todoist-title', text: current.title, y_align: Clutter.ActorAlign.CENTER,
            }));
            minimal.add_child(taskIcon(current, 'todoist-icon'));
            minimal.add_child(new St.Label({
                style_class: 'island-bubble-label', text: current.title, y_align: Clutter.ActorAlign.CENTER,
            }));

            const today = GLib.DateTime.new_now_local().format('%Y-%m-%d');
            expanded.add_child(new St.Label({
                style_class: 'todoist-heading', text: `Today · ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`,
            }));
            tasks.slice(0, LISTED_TASKS).forEach((task, index) =>
                expanded.add_child(taskRow(plugin, task, today, index === 0)));
            if (tasks.length > LISTED_TASKS)
                expanded.add_child(new St.Label({style_class: 'todoist-more', text: `+${tasks.length - LISTED_TASKS} more`}));
            if (error)
                expanded.add_child(new St.Label({style_class: 'todoist-error', text: error}));
        },
        destroy() {
            settings.disconnect(tokenChangedId);
            http.destroy();
            compact.destroy();
            expanded.destroy();
            minimal.destroy();
        },
    };
}
