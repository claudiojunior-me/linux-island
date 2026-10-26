// ABOUTME: Names and describes every plugin the island ships, in display order.
// ABOUTME: Pure data, so the preferences window can list plugins without loading GNOME Shell code.

// Setting with the ids of the plugins the island loads.
export const ENABLED_PLUGINS_SETTING = 'enabled-plugins';

export const PLUGIN_MANIFEST = Object.freeze([
    {id: 'pomodoro', title: 'Pomodoro', description: 'Focus and break timer'},
    {id: 'activities', title: 'Live activities', description: 'Cards pushed by scripts and Claude Code'},
    {id: 'privacy', title: 'Privacy indicator', description: 'Microphone, screen sharing and camera in use'},
    {id: 'todoist', title: 'Todoist', description: 'Current task and today\'s list'},
]);
