// ABOUTME: Todoist API v1 calls the island needs: today's and overdue tasks, and closing a task.
// ABOUTME: Takes an http(request) function so GNOME Shell (Soup) and Node (fetch) share this code.

const BASE_URL = 'https://api.todoist.com/api/v1';
const TODAY_QUERY = 'today | overdue';
const PAGE_SIZE = 200;

export class TodoistApi {
    // http({method, url, headers}) resolves to {status, body} with body as text.
    constructor({token, http}) {
        if (!token)
            throw new Error('Todoist API token is required');
        this._token = token;
        this._http = http;
    }

    async fetchTodayTasks() {
        const tasks = [];
        let cursor = null;
        do {
            let url = `${BASE_URL}/tasks/filter?query=${encodeURIComponent(TODAY_QUERY)}&limit=${PAGE_SIZE}`;
            if (cursor)
                url += `&cursor=${encodeURIComponent(cursor)}`;
            const page = JSON.parse(await this._request('GET', url));
            tasks.push(...page.results);
            cursor = page.next_cursor;
        } while (cursor);
        return tasks;
    }

    async closeTask(id) {
        await this._request('POST', `${BASE_URL}/tasks/${encodeURIComponent(id)}/close`);
    }

    async _request(method, url) {
        const {status, body} = await this._http({method, url, headers: {Authorization: `Bearer ${this._token}`}});
        if (status < 200 || status >= 300)
            throw new Error(`Todoist API ${status}: ${body}`.trim());
        return body;
    }
}
