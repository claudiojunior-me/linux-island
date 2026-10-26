// ABOUTME: Publishes the island control API on the session bus so scripts and keybindings can drive plugins.
// ABOUTME: Example: gdbus call --session --dest io.github.claudiojunior_me.LinuxIsland ... Activate pomodoro toggle
import Gio from 'gi://Gio';

export const BUS_NAME = 'io.github.claudiojunior_me.LinuxIsland';
export const OBJECT_PATH = '/io/github/claudiojunior_me/LinuxIsland';

const INTERFACE_XML = `
<node>
  <interface name="${BUS_NAME}">
    <method name="ListPlugins">
      <arg name="ids" type="as" direction="out"/>
    </method>
    <method name="GetForeground">
      <arg name="pluginId" type="s" direction="out"/>
    </method>
    <method name="GetState">
      <arg name="pluginId" type="s" direction="in"/>
      <arg name="stateJson" type="s" direction="out"/>
    </method>
    <method name="Activate">
      <arg name="pluginId" type="s" direction="in"/>
      <arg name="action" type="s" direction="in"/>
    </method>
  </interface>
</node>`;

export class ControlBus {
    constructor(control) {
        this._exported = Gio.DBusExportedObject.wrapJSObject(INTERFACE_XML, control);
        this._exported.export(Gio.DBus.session, OBJECT_PATH);
        this._nameId = Gio.bus_own_name_on_connection(
            Gio.DBus.session, BUS_NAME, Gio.BusNameOwnerFlags.NONE, null, null);
    }

    destroy() {
        Gio.bus_unown_name(this._nameId);
        this._exported.unexport();
    }
}
