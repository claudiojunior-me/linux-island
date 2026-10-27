// ABOUTME: Maps Claude Code hook events to live activity commands, one card per session.
// ABOUTME: Returns null for events the island does not show.

const FINISHED_TIMEOUT_SECONDS = 120;

const basename = path => path.replace(/\/+$/, '').split('/').pop();

export function activityCommandForHook(input) {
    if (typeof input?.session_id !== 'string' || input.session_id === '')
        return null;

    const id = `claude-${input.session_id.slice(0, 8)}`;
    const title = input.cwd ? `Claude · ${basename(input.cwd)}` : 'Claude';
    switch (input.hook_event_name) {
    case 'UserPromptSubmit':
        return {action: 'push', payload: {id, title, subtitle: 'Working…', accent: 'normal'}};
    case 'Notification':
        return {action: 'push', payload: {id, title, subtitle: input.message || 'Waiting for you', accent: 'attention'}};
    case 'Stop':
        return {
            action: 'push',
            payload: {id, title, subtitle: 'Finished, your turn', accent: 'success', timeoutSeconds: FINISHED_TIMEOUT_SECONDS},
        };
    case 'SessionEnd':
        return {action: 'end', payload: {id}};
    default:
        return null;
    }
}
