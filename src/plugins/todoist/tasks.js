// ABOUTME: Turns Todoist API v1 tasks into the island's task shape and orders them.
// ABOUTME: Order: priority (4 = p1 first), then timed tasks by time, then by due date, then Todoist's own order.

export function normalizeTask(task) {
    return {
        id: task.id,
        title: task.content,
        priority: task.priority,
        dueDate: task.due?.date ?? null,
        dueTime: task.due?.datetime ?? null,
        order: task.child_order,
    };
}

// Timed tasks sort before untimed ones on the same day; tasks without a date go last.
const dueKey = task => [task.dueTime === null ? 1 : 0, task.dueTime ?? task.dueDate ?? '9999-12-31'];

export function orderTasks(tasks) {
    return [...tasks].sort((a, b) => {
        if (a.priority !== b.priority)
            return b.priority - a.priority;
        const [aUntimed, aDue] = dueKey(a);
        const [bUntimed, bDue] = dueKey(b);
        if (aUntimed !== bUntimed)
            return aUntimed - bUntimed;
        if (aDue !== bDue)
            return aDue < bDue ? -1 : 1;
        return a.order - b.order;
    });
}

// Short text next to a task: its local time when timed, "Overdue" for earlier days. `today` is YYYY-MM-DD.
export function dueLabel(task, today) {
    if (task.dueDate !== null && task.dueDate < today)
        return 'Overdue';
    if (task.dueTime === null)
        return '';
    const time = new Date(task.dueTime);
    return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}
