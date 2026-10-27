// ABOUTME: Row of small dots, one per card, with the current card's dot drawn wider and brighter.
// ABOUTME: Rebuilds its dots only when the number of cards changes.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

export class PageDots {
    constructor(params = {}) {
        this.actor = new St.BoxLayout({style_class: 'island-page-dots', y_align: Clutter.ActorAlign.CENTER, ...params});
    }

    // index is -1 when no card is current.
    update({index, count}) {
        if (this.actor.get_n_children() !== count) {
            this.actor.destroy_all_children();
            for (let i = 0; i < count; i++)
                this.actor.add_child(new St.Widget({style_class: 'island-page-dot', y_align: Clutter.ActorAlign.CENTER}));
        }
        this.actor.get_children().forEach((dot, i) => {
            if (i === index)
                dot.add_style_class_name('active');
            else
                dot.remove_style_class_name('active');
        });
    }
}
