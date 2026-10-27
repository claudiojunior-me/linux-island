// ABOUTME: The island drawn below the top bar: a pill with the current card and a bubble with the runner-up.
// ABOUTME: Scrolling pages through the cards; expanded, the pill takes the keyboard for arrows and Escape.
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {CardDeck} from '../core/card-deck.js';
import {ScrollSteps} from '../core/scroll-steps.js';
import {verticalBox} from './box.js';

const GAP_BELOW_PANEL = 6;
const RESIZE_DURATION_MS = 250;
const BUBBLE_FADE_MS = 200;

const PREVIOUS_KEYS = [Clutter.KEY_Left, Clutter.KEY_Up];
const NEXT_KEYS = [Clutter.KEY_Right, Clutter.KEY_Down];
const SCROLL_STEPS = {
    [Clutter.ScrollDirection.UP]: -1,
    [Clutter.ScrollDirection.LEFT]: -1,
    [Clutter.ScrollDirection.DOWN]: 1,
    [Clutter.ScrollDirection.RIGHT]: 1,
};

// GNOME Shell 49 and earlier report what a grab holds; from 50 a grab either holds the seat or is revoked.
function grabHoldsKeyboard(grab) {
    if (grab.get_seat_state)
        return (grab.get_seat_state() & Clutter.GrabState.KEYBOARD) !== 0;
    return !grab.is_revoked();
}

export class Island {
    // `shells` maps each plugin id to its shell part: {compact, expanded, minimal, update(state), destroy()}.
    // Plugins may come and go while the island is up; openSettings opens the preferences window.
    // cardOrder lists plugin ids in the order scrolling and the arrow keys page through them.
    constructor(registry, shells, {openSettings, cardOrder}) {
        this._registry = registry;
        this._shells = shells;
        this._deck = new CardDeck(registry, cardOrder);
        this._scrollSteps = new ScrollSteps();
        this._pluginSubscriptions = new Map();
        this._pillId = null;
        this._pillExpanded = false;
        this._bubbleId = null;
        this._expanded = false;
        this._grab = null;
        this._renderedStates = new Map();
        this._disconnects = [];

        this.actor = new St.BoxLayout({name: 'linux-island', style_class: 'island-group'});
        this._pill = verticalBox({
            name: 'linux-island-pill', style_class: 'island', reactive: true, clip_to_allocation: true,
        });
        this._header = new St.Button({style_class: 'island-header', x_expand: true});
        this._expandedBin = new St.Bin({style_class: 'island-expanded-content', visible: false});
        this._footer = new St.BoxLayout({style_class: 'island-footer', visible: false});
        const settingsButton = new St.Button({
            style_class: 'island-settings-button',
            accessible_name: 'Linux Island settings',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            child: new St.Icon({icon_name: 'emblem-system-symbolic', style_class: 'island-settings-icon'}),
        });
        settingsButton.connect('clicked', () => openSettings());
        this._footer.add_child(settingsButton);
        this._bubble = new St.Button({
            name: 'linux-island-bubble', style_class: 'island-bubble', y_align: Clutter.ActorAlign.START, visible: false,
        });
        this._pill.add_child(this._header);
        this._pill.add_child(this._expandedBin);
        this._pill.add_child(this._footer);
        this.actor.add_child(this._pill);
        this.actor.add_child(this._bubble);

        this._header.connect('clicked', () => this._setExpanded(!this._expanded));
        this._bubble.connect('clicked', () => {
            this._deck.choose(this._bubbleId);
            this._setExpanded(true);
        });
        this._pill.connect('scroll-event', (_actor, event) => this._onScroll(event));
        this._pill.connect('key-press-event', (_actor, event) => this._onKeyPress(event));
        this.actor.connect('captured-event', (_actor, event) => this._onCapturedEvent(event));
        this.actor.connect('notify::width', () => this._reposition());

        this._disconnects.push(registry.subscribe(() => {
            this._trackPlugins();
            this._sync();
        }));
        this._disconnects.push(() => this._pluginSubscriptions.forEach(unsubscribe => unsubscribe()));
        this._trackPlugins();

        const monitorsId = Main.layoutManager.connect('monitors-changed', () => this._reposition());
        this._disconnects.push(() => Main.layoutManager.disconnect(monitorsId));

        Main.layoutManager.addTopChrome(this.actor, {trackFullscreen: true});
        this._sync();
    }

    destroy() {
        this._releaseKeyboard();
        this._disconnects.forEach(disconnect => disconnect());
        this._header.set_child(null);
        this._expandedBin.set_child(null);
        this._bubble.set_child(null);
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    // Follows plugins as they are loaded and unloaded, letting go of views that are about to be destroyed.
    _trackPlugins() {
        const registered = new Set(this._registry.list().map(plugin => plugin.id));
        for (const [id, unsubscribe] of this._pluginSubscriptions) {
            if (!registered.has(id)) {
                unsubscribe();
                this._pluginSubscriptions.delete(id);
                this._renderedStates.delete(id);
            }
        }
        for (const plugin of this._registry.list()) {
            if (!this._pluginSubscriptions.has(plugin.id))
                this._pluginSubscriptions.set(plugin.id, plugin.subscribe(() => this._sync()));
        }

        if (this._pillId !== null && !registered.has(this._pillId)) {
            this._header.set_child(null);
            this._expandedBin.set_child(null);
            this._pillId = null;
        }
        if (this._bubbleId !== null && !registered.has(this._bubbleId))
            this._showInBubble(null);
    }

    // Expanded, the island holds a modal grab so the arrow keys and Escape reach it, as top bar menus do.
    _setExpanded(expanded) {
        this._expanded = expanded;
        if (expanded)
            this._takeKeyboard();
        else
            this._releaseKeyboard();
        this._sync();
    }

    _takeKeyboard() {
        if (this._grab)
            return;
        const grab = Main.pushModal(this.actor, {actionMode: Shell.ActionMode.POPUP});
        if (!grabHoldsKeyboard(grab)) {
            // Another grab holds the keyboard; the island stays expanded without it.
            Main.popModal(grab);
            return;
        }
        this._grab = grab;
        this._pill.grab_key_focus();
    }

    _releaseKeyboard() {
        if (!this._grab)
            return;
        Main.popModal(this._grab);
        this._grab = null;
    }

    _page(step) {
        if (step < 0)
            this._deck.previous();
        else if (step > 0)
            this._deck.next();
        this._sync();
    }

    _onScroll(event) {
        // Smooth scroll devices also send emulated wheel events; counting both would page twice.
        if (event.is_pointer_emulated())
            return Clutter.EVENT_STOP;
        const direction = event.get_scroll_direction();
        let delta = SCROLL_STEPS[direction] ?? 0;
        if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [dx, dy] = event.get_scroll_delta();
            delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        }
        this._page(this._scrollSteps.add(delta));
        return Clutter.EVENT_STOP;
    }

    _onKeyPress(event) {
        const key = event.get_key_symbol();
        if (key === Clutter.KEY_Escape)
            this._setExpanded(false);
        else if (PREVIOUS_KEYS.includes(key))
            this._page(-1);
        else if (NEXT_KEYS.includes(key))
            this._page(1);
        else
            return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    }

    // While the grab is held, a press anywhere outside the pill collapses the island.
    _onCapturedEvent(event) {
        if (!this._grab)
            return Clutter.EVENT_PROPAGATE;
        const type = event.type();
        if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
            return Clutter.EVENT_PROPAGATE;
        if (this._pill.contains(global.stage.get_event_actor(event)))
            return Clutter.EVENT_PROPAGATE;
        this._setExpanded(false);
        return Clutter.EVENT_STOP;
    }

    _sync() {
        this._deck.refresh();
        const pillPlugin = this._deck.current();
        if (!pillPlugin) {
            this._expanded = false;
            this._releaseKeyboard();
            this.actor.hide();
            return;
        }
        this.actor.show();

        const expanded = this._expanded;
        const bubblePlugin = expanded ? null : this._deck.runnerUp();

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
        this._footer.visible = expanded;
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
