// ABOUTME: Builds vertical St.BoxLayout containers on every supported GNOME Shell version.
// ABOUTME: GNOME Shell 46 and 47 take `vertical: true`; 48 and later take `orientation`.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {PACKAGE_VERSION} from 'resource:///org/gnome/shell/misc/config.js';

const SHELL_MAJOR_VERSION = parseInt(PACKAGE_VERSION.split('.')[0], 10);

const VERTICAL = SHELL_MAJOR_VERSION >= 48
    ? {orientation: Clutter.Orientation.VERTICAL}
    : {vertical: true};

export function verticalBox(params = {}) {
    return new St.BoxLayout({...params, ...VERTICAL});
}
