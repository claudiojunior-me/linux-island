// ABOUTME: Privacy plugin inside GNOME Shell: watches microphone, screen cast and camera use, and draws the views.
// ABOUTME: Uses the same sources as the shell's own indicators; the camera only where the shell can watch it.
import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import {verticalBox} from '../../shell/box.js';

// Mixer apps open input streams to draw level meters; the shell's microphone indicator ignores them too.
const MIXER_APPS = ['org.gnome.VolumeControl', 'org.PulseAudio.pavucontrol'];

function watchMicrophone(plugin) {
    const control = Volume.getMixerControl();
    const refresh = () => plugin.setMicrophoneApps(control.get_source_outputs()
        .filter(output => !MIXER_APPS.includes(output.get_application_id()))
        .map(output => output.get_name() || output.get_application_id() || 'Unknown app'));
    const ids = ['state-changed', 'stream-added', 'stream-removed'].map(signal => control.connect(signal, refresh));
    refresh();
    return () => ids.forEach(id => control.disconnect(id));
}

// Screen casts (portal sharing, the shell recorder, remote desktop) arrive as handles until they stop.
function watchScreen(plugin) {
    const controller = global.backend.get_remote_access_controller();
    if (!controller)
        return {stopAll: () => {}, disconnect: () => {}};
    const handles = new Map();
    const refresh = () => plugin.setScreenSessions(
        [...handles.keys()].map(handle => handle.is_recording ? 'recording' : 'sharing'));
    const newHandleId = controller.connect('new-handle', (_controller, handle) => {
        const stoppedId = handle.connect('stopped', () => {
            handle.disconnect(stoppedId);
            handles.delete(handle);
            refresh();
        });
        handles.set(handle, stoppedId);
        refresh();
    });
    return {
        stopAll: () => [...handles.keys()].forEach(handle => handle.stop()),
        disconnect: () => {
            controller.disconnect(newHandleId);
            handles.forEach((stoppedId, handle) => handle.disconnect(stoppedId));
        },
    };
}

// Shell.CameraMonitor exists from GNOME Shell 47; on older shells camera use stays unknown.
function watchCamera(plugin) {
    if (!Shell.CameraMonitor)
        return () => {};
    try {
        const monitor = new Shell.CameraMonitor();
        const refresh = () => plugin.setCameraInUse(Boolean(monitor.cameras_in_use));
        const id = monitor.connect('notify::cameras-in-use', refresh);
        refresh();
        return () => monitor.disconnect(id);
    } catch (error) {
        console.warn(`linux-island: camera monitor unavailable: ${error}`);
        return () => {};
    }
}

const SCREEN_LABELS = {recording: 'Screen recording', sharing: 'Screen shared'};

// The sensors in use, in the order they are shown: screen, camera, microphone.
function sensorsInUse({microphoneApps, screen, camera}) {
    const sensors = [];
    if (screen)
        sensors.push({kind: 'screen', label: SCREEN_LABELS[screen]});
    if (camera)
        sensors.push({kind: 'camera', label: 'Camera'});
    if (microphoneApps.length > 0)
        sensors.push({kind: 'microphone', label: `Mic: ${microphoneApps.join(', ')}`});
    return sensors;
}

const sensorDot = kind => new St.Widget({style_class: `privacy-dot ${kind}`, y_align: Clutter.ActorAlign.CENTER});

export function createPrivacyShell(plugin) {
    const stopWatchingMicrophone = watchMicrophone(plugin);
    const screen = watchScreen(plugin);
    const stopWatchingCamera = watchCamera(plugin);

    const compact = new St.BoxLayout({style_class: 'privacy-compact'});
    const minimal = new St.BoxLayout({style_class: 'privacy-dots'});
    const expanded = verticalBox({style_class: 'privacy-list'});

    return {
        compact,
        expanded,
        minimal,
        update(state) {
            compact.destroy_all_children();
            minimal.destroy_all_children();
            expanded.destroy_all_children();
            const sensors = sensorsInUse(state);
            if (sensors.length === 0)
                return;

            const dots = new St.BoxLayout({style_class: 'privacy-dots'});
            sensors.forEach(sensor => dots.add_child(sensorDot(sensor.kind)));
            compact.add_child(dots);
            compact.add_child(new St.Label({
                style_class: 'privacy-summary',
                text: sensors.map(sensor => sensor.label).join(' · '),
                y_align: Clutter.ActorAlign.CENTER,
            }));
            sensors.forEach(sensor => minimal.add_child(sensorDot(sensor.kind)));

            for (const sensor of sensors) {
                const row = new St.BoxLayout({style_class: 'privacy-row'});
                row.add_child(sensorDot(sensor.kind));
                row.add_child(new St.Label({
                    style_class: 'privacy-label', text: sensor.label, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
                }));
                if (sensor.kind === 'screen') {
                    const stop = new St.Button({style_class: 'privacy-stop', label: 'Stop'});
                    stop.connect('clicked', () => screen.stopAll());
                    row.add_child(stop);
                }
                expanded.add_child(row);
            }
        },
        destroy() {
            stopWatchingMicrophone();
            screen.disconnect();
            stopWatchingCamera();
            compact.destroy();
            expanded.destroy();
            minimal.destroy();
        },
    };
}
