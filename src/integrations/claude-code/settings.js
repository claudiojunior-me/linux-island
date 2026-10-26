// ABOUTME: Adds or removes the island hook in a Claude Code settings object.
// ABOUTME: Pure functions returning new objects; hooks the user already has stay untouched.

export const HOOK_EVENTS = Object.freeze(['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd']);

const runsCommand = (entry, command) => entry.hooks?.some(hook => hook.command === command);

export function addIslandHooks(settings, command) {
    const hooks = {...settings.hooks};
    for (const event of HOOK_EVENTS) {
        const entries = hooks[event] ?? [];
        if (!entries.some(entry => runsCommand(entry, command)))
            hooks[event] = [...entries, {hooks: [{type: 'command', command}]}];
    }
    return {...settings, hooks};
}

export function removeIslandHooks(settings, command) {
    const hooks = {};
    for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
        const kept = entries.filter(entry => !runsCommand(entry, command));
        if (kept.length > 0)
            hooks[event] = kept;
    }
    const {hooks: _previous, ...rest} = settings;
    return Object.keys(hooks).length > 0 ? {...rest, hooks} : rest;
}
