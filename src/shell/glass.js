// ABOUTME: Frosted glass behind island surfaces: a blurred copy of the wallpaper and windows, cut to rounded corners.
// ABOUTME: Each surface gets a backdrop just below the island that follows the surface's place, size and opacity.
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BLUR_RADIUS = 24;
const BLUR_BRIGHTNESS = 0.75;

// GNOME Shell 46 and 47 name the hook in Shell; 48 and later in Cogl.
const FRAGMENT_HOOK = (Shell.SnippetHook ?? Cogl.SnippetHook).FRAGMENT;

const CORNERS_DECLARATIONS = `
uniform vec2 size;
uniform float radius;

// 1 inside the rounded rectangle, 0 outside, with a one-pixel soft edge.
float rounded_coverage(vec2 point) {
    vec2 q = abs(point - size * 0.5) - (size * 0.5 - radius);
    float distance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
    return clamp(0.5 - distance, 0.0, 1.0);
}
`;

const CORNERS_CODE = `
cogl_color_out *= rounded_coverage(cogl_tex_coord_in[0].xy * size);
`;

const RoundedCornersEffect = GObject.registerClass(
class RoundedCornersEffect extends Shell.GLSLEffect {
    vfunc_build_pipeline() {
        this.add_glsl_snippet(FRAGMENT_HOOK, CORNERS_DECLARATIONS, CORNERS_CODE, false);
    }

    update(width, height, radius) {
        this.set_uniform_float(this.get_uniform_location('size'), 2, [width, height]);
        this.set_uniform_float(this.get_uniform_location('radius'), 1, [Math.min(radius, width / 2, height / 2)]);
        this.queue_repaint();
    }
});

// Gives an St widget already placed under Main.layoutManager.uiGroup a frosted glass backdrop.
// The backdrop is named after the widget with a "-glass" suffix and is destroyed with it.
export function makeGlass(widget) {
    const uiGroup = Main.layoutManager.uiGroup;
    const ancestors = [];
    for (let actor = widget; actor !== uiGroup; actor = actor.get_parent())
        ancestors.push(actor);
    const islandRoot = ancestors.at(-1);

    // The window group holds the wallpaper and the windows, and never the island, so the copy cannot show itself.
    const scene = new Clutter.Clone({source: global.window_group});
    const backdrop = new Clutter.Actor({name: `${widget.name}-glass`, clip_to_allocation: true, reactive: false});
    backdrop.add_child(scene);
    // Effects added first paint outermost: the corners cut what the blur made from the copy.
    const corners = new RoundedCornersEffect();
    backdrop.add_effect_with_name('island-glass-corners', corners);
    backdrop.add_effect_with_name('island-glass-blur', new Shell.BlurEffect({
        mode: Shell.BlurMode.ACTOR,
        radius: BLUR_RADIUS,
        brightness: BLUR_BRIGHTNESS,
    }));
    uiGroup.insert_child_below(backdrop, islandRoot);

    const follow = () => {
        backdrop.visible = widget.mapped;
        if (!widget.mapped)
            return;
        const [x, y] = widget.get_transformed_position();
        const [width, height] = widget.get_transformed_size();
        backdrop.set_position(x, y);
        backdrop.set_size(width, height);
        scene.set_position(-x, -y);
        backdrop.opacity = widget.opacity;
        // Theme lengths are in device pixels, the actor size in logical pixels; the shader works in logical ones.
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        corners.update(width, height, widget.get_theme_node().get_border_radius(St.Corner.TOPLEFT) / scale);
    };
    // Moving any ancestor moves the widget without changing the widget's own allocation.
    for (const actor of ancestors)
        actor.connectObject('notify::allocation', follow, backdrop);
    widget.connectObject(
        'notify::mapped', follow,
        'notify::opacity', follow,
        'style-changed', follow,
        'destroy', () => backdrop.destroy(),
        backdrop);
    follow();
}
