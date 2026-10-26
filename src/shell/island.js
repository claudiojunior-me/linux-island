// ABOUTME: The island pill drawn below the top bar, showing the foreground plugin.
// ABOUTME: Click toggles between the compact and expanded views with a size animation.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {verticalBox} from './box.js';

const GAP_BELOW_PANEL = 6;
const RESIZE_DURATION_MS = 250;

export class Island {
    // `shells` maps each plugin id to its shell part: {compact, expanded, update(state), destroy()}.
    constructor(registry, shells) {
        this._registry = registry;
        this._shells = shells;
        this._foregroundId = null;
        this._expanded = false;
        this._disconnects = [];

        this.actor = verticalBox({
            name: 'linux-island',
            style_class: 'island',
            reactive: true,
            clip_to_allocation: true,
        });
        this._header = new St.Button({style_class: 'island-header', x_expand: true});
        this._expandedBin = new St.Bin({style_class: 'island-expanded-content', visible: false});
        this.actor.add_child(this._header);
        this.actor.add_child(this._expandedBin);

        this._header.connect('clicked', () => this._setExpanded(!this._expanded));
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
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    _sync() {
        const plugin = this._registry.foreground();
        if (!plugin) {
            this.actor.hide();
            return;
        }
        this.actor.show();

        const shell = this._shells.get(plugin.id);
        if (plugin.id === this._foregroundId) {
            shell.update(plugin.getState());
            return;
        }

        const swap = () => {
            this._header.set_child(shell.compact);
            this._expandedBin.set_child(shell.expanded);
            shell.update(plugin.getState());
        };
        if (this._foregroundId === null)
            swap();
        else
            this._resizeAnimated(swap);
        this._foregroundId = plugin.id;
    }

    _setExpanded(expanded) {
        this._expanded = expanded;
        this._resizeAnimated(() => {
            this._expandedBin.visible = expanded;
            if (expanded)
                this.actor.add_style_pseudo_class('expanded');
            else
                this.actor.remove_style_pseudo_class('expanded');
        });
    }

    // Applies a content change, then grows or shrinks the pill from its old size to the new one.
    _resizeAnimated(change) {
        const [startWidth, startHeight] = this.actor.get_size();
        change();

        const [, , targetWidth, targetHeight] = this.actor.get_preferred_size();
        this.actor.remove_all_transitions();
        this.actor.set_size(startWidth, startHeight);
        this.actor.ease({
            width: targetWidth,
            height: targetHeight,
            duration: RESIZE_DURATION_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            // Hands sizing back to the layout so later content changes still resize the pill.
            onComplete: () => this.actor.set_size(-1, -1),
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
