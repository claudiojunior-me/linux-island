// ABOUTME: Frosted glass behind island surfaces: a blurred copy of the wallpaper and windows, cut to rounded corners.
// ABOUTME: Each surface sits in a frame whose first child is its glass, laid out with the surface itself.
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';
import Shell from 'gi://Shell';
import St from 'gi://St';

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

// Blurred copy of the wallpaper and windows behind its own place on screen, cut to the surface's corners.
const GlassBackdrop = GObject.registerClass(
class GlassBackdrop extends Clutter.Actor {
    constructor(surface) {
        super({name: `${surface.name}-glass`, clip_to_allocation: true, reactive: false, x_expand: true, y_expand: true});
        this._surface = surface;
        // The window group holds the wallpaper and the windows, never the island, so the copy cannot show itself.
        this._scene = new Clutter.Clone({source: global.window_group});
        this.add_child(this._scene);
        // Effects added first paint outermost: the corners cut what the blur made from the copy.
        this._corners = new RoundedCornersEffect();
        this.add_effect_with_name('island-glass-corners', this._corners);
        this.add_effect_with_name('island-glass-blur', new Shell.BlurEffect({
            mode: Shell.BlurMode.ACTOR,
            radius: BLUR_RADIUS,
            brightness: BLUR_BRIGHTNESS,
        }));
    }

    // Takes whatever size the frame gives it; the copy of the whole scene must not make the frame grow.
    vfunc_get_preferred_width(_forHeight) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_forWidth) {
        return [0, 0];
    }

    vfunc_allocate(box) {
        this.set_allocation(box);
        this._scene.allocate_preferred_size(0, 0);

        // Theme lengths are in device pixels, the actor size in logical pixels; the shader works in logical ones.
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const radius = this._surface.get_theme_node().get_border_radius(St.Corner.TOPLEFT) / scale;
        this._corners.update(box.get_width(), box.get_height(), radius);
    }

    // Shifts the copy by where the backdrop is on the stage at paint time, so it lines up even when only an
    // ancestor moved and no new allocation reached the backdrop.
    vfunc_paint(paintContext) {
        const [x, y] = this.get_transformed_position();
        const framebuffer = paintContext.get_framebuffer();
        framebuffer.push_matrix();
        framebuffer.translate(-x, -y, 0);
        super.vfunc_paint(paintContext);
        framebuffer.pop_matrix();
    }
});

// Puts an St widget on frosted glass. Returns the frame to place where the widget would go: it holds the glass
// below the widget, sized with it, and shows, hides and fades along with it.
export function frameInGlass(widget) {
    // The frame takes the widget's place in its parent's layout, so it takes the widget's alignment too.
    const frame = new Clutter.Actor({
        name: `${widget.name}-frame`,
        layout_manager: new Clutter.BinLayout(),
        x_align: widget.x_align,
        y_align: widget.y_align,
        x_expand: widget.x_expand,
        y_expand: widget.y_expand,
    });
    const backdrop = new GlassBackdrop(widget);
    frame.add_child(backdrop);
    frame.add_child(widget);
    widget.bind_property('visible', frame, 'visible', GObject.BindingFlags.SYNC_CREATE);
    widget.bind_property('opacity', backdrop, 'opacity', GObject.BindingFlags.SYNC_CREATE);
    return frame;
}
