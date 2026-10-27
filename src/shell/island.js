// ABOUTME: The island drawn below the top bar: a pill with the current card and a bubble with the runner-up.
// ABOUTME: Scrolling pages through the cards with a slide and page dots; expanded, arrows and Escape work too.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {CardDeck} from '../core/card-deck.js';
import {ScrollSteps} from '../core/scroll-steps.js';
import {verticalBox} from './box.js';
import {frameInGlass} from './glass.js';
import {PageDots} from './page-dots.js';

const GAP_BELOW_PANEL = 6;
const RESIZE_DURATION_MS = 250;
const BUBBLE_FADE_MS = 200;
const SLIDE_DISTANCE = 28;
const SLIDE_OUT_MS = 110;
const SLIDE_IN_MS = 220;
const PEEK_DOTS_GAP = 4;
const PEEK_DOTS_SHOWN_MS = 1200;
const PEEK_DOTS_FADE_MS = 200;

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
        this._pageDirection = 0;
        this._pendingSwap = null;
        this._peekTimeoutId = 0;
        this._renderedStates = new Map();
        this._disconnects = [];

        this.actor = new St.BoxLayout({name: 'linux-island', style_class: 'island-group'});
        this._pill = verticalBox({
            name: 'linux-island-pill', style_class: 'island', reactive: true, clip_to_allocation: true,
        });
        this._title = new St.Label({name: 'linux-island-card-title', style_class: 'island-card-title', visible: false});
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
        this._footerDots = new PageDots({name: 'linux-island-footer-dots'});
        this._footer.add_child(this._footerDots.actor);
        this._footer.add_child(settingsButton);
        // Shown below the collapsed pill for a moment after paging.
        this._peekDots = new PageDots({
            name: 'linux-island-peek-dots', style_class: 'island-page-dots island-peek-dots', visible: false, opacity: 0,
        });
        this._bubble = new St.Button({
            name: 'linux-island-bubble', style_class: 'island-bubble', y_align: Clutter.ActorAlign.START, visible: false,
        });
        this._pill.add_child(this._title);
        this._pill.add_child(this._header);
        this._pill.add_child(this._expandedBin);
        this._pill.add_child(this._footer);
        this.actor.add_child(frameInGlass(this._pill));
        this.actor.add_child(frameInGlass(this._bubble));
        // What slides when the user pages from one card to the next.
        this._cardParts = [this._title, this._header, this._expandedBin];

        this._header.connect('clicked', () => this._setExpanded(!this._expanded));
        this._bubble.connect('clicked', () => {
            this._deck.choose(this._bubbleId);
            this._setExpanded(true);
        });
        this._pill.connect('scroll-event', (_actor, event) => this._onScroll(event));
        this._pill.connect('key-press-event', (_actor, event) => this._onKeyPress(event));
        this.actor.connect('captured-event', (_actor, event) => this._onCapturedEvent(event));
        this.actor.connect('notify::width', () => this._reposition());
        this._pill.connect('notify::height', () => this._reposition());
        this._peekDots.actor.connect('notify::width', () => this._reposition());

        this._disconnects.push(registry.subscribe(() => {
            this._trackPlugins();
            this._sync();
        }));
        this._disconnects.push(() => this._pluginSubscriptions.forEach(unsubscribe => unsubscribe()));
        this._trackPlugins();

        const monitorsId = Main.layoutManager.connect('monitors-changed', () => this._reposition());
        this._disconnects.push(() => Main.layoutManager.disconnect(monitorsId));

        Main.layoutManager.addTopChrome(this.actor, {trackFullscreen: true});
        // Left out of the chrome so the dots stay outside the input region.
        this._peekDotsFrame = frameInGlass(this._peekDots.actor);
        Main.layoutManager.uiGroup.add_child(this._peekDotsFrame);
        this._sync();
    }

    destroy() {
        this._releaseKeyboard();
        this._disconnects.forEach(disconnect => disconnect());
        if (this._peekTimeoutId)
            GLib.source_remove(this._peekTimeoutId);
        this._settleSlide();
        this._header.set_child(null);
        this._expandedBin.set_child(null);
        this._bubble.set_child(null);
        this._peekDotsFrame.destroy();
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
            this._settleSlide();
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
        if (step === 0)
            return;
        if (step < 0)
            this._deck.previous();
        else
            this._deck.next();
        this._pageDirection = step;
        this._sync();
        this._pageDirection = 0;
        if (!this._expanded)
            this._peek();
    }

    // Fades the dots in below the collapsed pill, then out again once paging stops.
    _peek() {
        const dots = this._peekDots.actor;
        dots.remove_all_transitions();
        dots.show();
        dots.ease({opacity: 255, duration: PEEK_DOTS_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
        if (this._peekTimeoutId)
            GLib.source_remove(this._peekTimeoutId);
        this._peekTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, PEEK_DOTS_SHOWN_MS, () => {
            this._peekTimeoutId = 0;
            this._hidePeek();
            return GLib.SOURCE_REMOVE;
        });
    }

    _hidePeek() {
        const dots = this._peekDots.actor;
        dots.remove_all_transitions();
        dots.ease({
            opacity: 0, duration: PEEK_DOTS_FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => dots.hide(),
        });
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
            this._peekDots.actor.hide();
            return;
        }
        this.actor.show();
        const position = this._deck.position();
        this._footerDots.update(position);
        this._peekDots.update(position);
        if (this._expanded && this._peekDots.actor.visible)
            this._hidePeek();

        const expanded = this._expanded;
        const bubblePlugin = expanded ? null : this._deck.runnerUp();

        this._render(pillPlugin);
        if (bubblePlugin)
            this._render(bubblePlugin);

        if (pillPlugin.id !== this._pillId || expanded !== this._pillExpanded) {
            const change = () => this._showInPill(pillPlugin, expanded);
            const paged = this._pageDirection !== 0 && this._pillId !== null && pillPlugin.id !== this._pillId;
            const first = this._pillId === null;
            this._pillId = pillPlugin.id;
            this._pillExpanded = expanded;
            if (first) {
                change();
            } else if (paged) {
                this._slide(this._pageDirection, change);
            } else {
                this._settleSlide();
                this._resizeAnimated(change);
            }
        }
        this._showInBubble(bubblePlugin);
    }

    // Slides the current card out toward where the user paged, then the next card in from the other side
    // while the pill takes its size.
    _slide(direction, swap) {
        this._settleSlide();
        this._pendingSwap = swap;
        const parts = this._cardParts;
        parts.forEach(part => part.ease({
            opacity: 0,
            translation_x: -direction * SLIDE_DISTANCE,
            duration: SLIDE_OUT_MS,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        }));
        this._header.connect_object('transitions-completed', () => {
            this._header.disconnect_object(this);
            if (this._pendingSwap !== swap)
                return;
            this._pendingSwap = null;
            this._resizeAnimated(swap);
            parts.forEach(part => {
                part.translation_x = direction * SLIDE_DISTANCE;
                part.ease({
                    opacity: 255,
                    translation_x: 0,
                    duration: SLIDE_IN_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            });
        }, this);
    }

    // Ends any slide at once: a swap still waiting is applied and the card is shown in place.
    _settleSlide() {
        this._header.disconnect_object(this);
        const swap = this._pendingSwap;
        this._pendingSwap = null;
        for (const part of this._cardParts) {
            part.remove_all_transitions();
            part.opacity = 255;
            part.translation_x = 0;
        }
        swap?.();
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
        this._title.text = plugin.title;
        this._title.visible = expanded;
        this._header.set_child(shell.compact);
        this._expandedBin.set_child(shell.expanded);
        this._expandedBin.visible = expanded;
        this._footer.visible = expanded;
        if (expanded)
            this._pill.add_style_pseudo_class('expanded');
        else
            this._pill.remove_style_pseudo_class('expanded');
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
        this._pill.remove_all_transitions();
        change();

        // Measures at the natural size, not at a fixed size left by a resize this one interrupted.
        this._pill.set_size(-1, -1);
        const [, , targetWidth, targetHeight] = this._pill.get_preferred_size();
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
        this._peekDotsFrame.set_position(
            Math.round(this.actor.x + (this._pill.width - this._peekDots.actor.width) / 2),
            this.actor.y + this._pill.height + PEEK_DOTS_GAP);
    }
}
