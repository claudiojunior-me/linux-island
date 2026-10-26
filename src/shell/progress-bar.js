// ABOUTME: Thin horizontal bar whose fill follows a 0..1 progress value.
// ABOUTME: A modifier style class on the fill picks its color, e.g. a pomodoro phase or an activity accent.
import St from 'gi://St';

export class ProgressBar {
    constructor() {
        this._progress = 0;
        this.actor = new St.Widget({style_class: 'island-progress-track', x_expand: true});
        this._fill = new St.Widget({style_class: 'island-progress-fill'});
        this.actor.add_child(this._fill);
        this.actor.connect('notify::width', () => this._redraw());
    }

    update(progress, modifier) {
        this._progress = progress;
        this._fill.set_style_class_name(`island-progress-fill ${modifier}`);
        this._redraw();
    }

    _redraw() {
        this._fill.width = Math.round(this.actor.width * this._progress);
    }
}
