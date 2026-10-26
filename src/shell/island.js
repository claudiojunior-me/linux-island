// ABOUTME: The island drawn below the top bar: a pill with the top plugin and a bubble with the runner-up.
// ABOUTME: Clicking either one expands that plugin inside the pill with a size animation.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {verticalBox} from './box.js';

const GAP_BELOW_PANEL = 6;
const RESIZE_DURATION_MS = 250;
const BUBBLE_FADE_MS = 200;
const VISIBLE_PLUGINS = 2;

export class Island {
    // `shells` maps each plugin id to its shell part: {compact, expanded, minimal, update(state), destroy()}.
    constructor(registry, shells) {
        this._registry = registry;
        this._shells = shells;
        this._pillId = null;
        this._pillExpanded = false;
        this._bubbleId = null;
        this._expandedId = null;
        this._renderedStates = new Map();
        this._disconnects = [];

        this.actor = new St.BoxLayout({name: 'linux-island', style_class: 'island-group'});
        this._pill = verticalBox({
            name: 'linux-island-pill', style_class: 'island', reactive: true, clip_to_allocation: true,
        });
        this._header = new St.Button({style_class: 'island-header', x_expand: true});
        this._expandedBin = new St.Bin({style_class: 'island-expanded-content', visible: false});
        this._bubble = new St.Button({
            name: 'linux-island-bubble', style_class: 'island-bubble', y_align: Clutter.ActorAlign.START, visible: false,
        });
        this._pill.add_child(this._header);
        this._pill.add_child(this._expandedBin);
        this.actor.add_child(this._pill);
        this.actor.add_child(this._bubble);

        this._header.connect('clicked', () => this._expand(this._expandedId === null ? this._pillId : null));
        this._bubble.connect('clicked', () => this._expand(this._bubbleId));
        this.actor.connect('notify::width', () => this._reposition());

        this._disconnects.push(registry.subscribe(() => this._sync()));
        for (const plugin of registry.list())
            this._disconnects.push(plugin.subscribe(() => this._sync()));

        const monitorsId = Main.layoutManager.connect('monitors-changed', () => this._reposition());
        this._disconnects.push(() => Main.layoutManager.disconnect(monitorsId));

        Main.layoutManager.addTopChrome(this.actor, {trackFullscreen: true});
        this._sync();
    }

    destroy() {
        this._disconnects.forEach(disconnect => disconnect());
        this._header.set_child(null);
        this._expandedBin.set_child(null);
        this._bubble.set_child(null);
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    _expand(pluginId) {
        this._expandedId = pluginId;
        this._sync();
    }

    _sync() {
        const visible = this._registry.visible(VISIBLE_PLUGINS);
        if (!visible.some(plugin => plugin.id === this._expandedId))
            this._expandedId = null;

        const [primary, secondary = null] = visible;
        if (!primary) {
            this.actor.hide();
            return;
        }
        this.actor.show();

        const expanded = this._expandedId !== null;
        const pillPlugin = expanded ? this._registry.get(this._expandedId) : primary;
        const bubblePlugin = expanded ? null : secondary;

        this._render(pillPlugin);
        if (bubblePlugin)
            this._render(bubblePlugin);

        if (pillPlugin.id !== this._pillId || expanded !== this._pillExpanded) {
            const change = () => this._showInPill(pillPlugin, expanded);
            if (this._pillId === null)
                change();
            else
                this._resizeAnimated(change);
        }
        this._showInBubble(bubblePlugin);
    }

    // Redraws a plugin's views only when its state changed, so rows under the pointer are not rebuilt.
    _render(plugin) {
        const state = plugin.getState();
        const key = JSON.stringify(state);
        if (this._renderedStates.get(plugin.id) === key)
            return;
        this._renderedStates.set(plugin.id, key);
        this._shells.get(plugin.id).update(state);
    }

    _showInPill(plugin, expanded) {
        const shell = this._shells.get(plugin.id);
        this._header.set_child(shell.compact);
        this._expandedBin.set_child(shell.expanded);
        this._expandedBin.visible = expanded;
        if (expanded)
            this._pill.add_style_pseudo_class('expanded');
        else
            this._pill.remove_style_pseudo_class('expanded');
        this._pillId = plugin.id;
        this._pillExpanded = expanded;
    }

    _showInBubble(plugin) {
        if (plugin?.id === this._bubbleId)
            return;
        this._bubbleId = plugin?.id ?? null;
        this._bubble.remove_all_transitions();
        if (!plugin) {
            this._bubble.hide();
            this._bubble.set_child(null);
            return;
        }
        this._bubble.set_child(this._shells.get(plugin.id).minimal);
        this._bubble.opacity = 0;
        this._bubble.show();
        this._bubble.ease({opacity: 255, duration: BUBBLE_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    }

    // Applies a content change, then grows or shrinks the pill from its old size to the new one.
    _resizeAnimated(change) {
        const [startWidth, startHeight] = this._pill.get_size();
        change();

        const [, , targetWidth, targetHeight] = this._pill.get_preferred_size();
        this._pill.remove_all_transitions();
        this._pill.set_size(startWidth, startHeight);
        this._pill.ease({
            width: targetWidth,
            height: targetHeight,
            duration: RESIZE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            // Hands sizing back to the layout so later content changes still resize the pill.
            onComplete: () => this._pill.set_size(-1, -1),
        });
    }

    _reposition() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        const panelBox = Main.layoutManager.panelBox;
        this.actor.set_position(
            Math.round(monitor.x + (monitor.width - this.actor.width) / 2),
            panelBox.y + panelBox.height + GAP_BELOW_PANEL);
    }
}
