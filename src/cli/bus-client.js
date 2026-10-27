// ABOUTME: Calls a method of the island control API through gdbus and returns its printed result.
// ABOUTME: Used by the command line tools that run outside GNOME Shell.
import {execFileSync} from 'node:child_process';

import {BUS_NAME, OBJECT_PATH} from '../core/bus-address.js';

export function callIsland(method, args, {timeoutMs = 2000} = {}) {
    return execFileSync('gdbus', [
        'call', '--session', '--dest', BUS_NAME, '--object-path', OBJECT_PATH,
        '--method', `${BUS_NAME}.${method}`, ...args,
    ], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs});
}
