// ABOUTME: Minimal async HTTP client for GNOME Shell, matching the http({method, url, headers}) shape plugins use.
// ABOUTME: Resolves to {status, body} with the body decoded as UTF-8 text.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');

const TIMEOUT_SECONDS = 20;

export class HttpClient {
    constructor() {
        this._session = new Soup.Session({timeout: TIMEOUT_SECONDS});
        this._decoder = new TextDecoder();
        this.request = this.request.bind(this);
    }

    async request({method, url, headers = {}}) {
        const message = Soup.Message.new(method, url);
        for (const [name, value] of Object.entries(headers))
            message.request_headers.append(name, value);
        const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        return {status: message.get_status(), body: this._decoder.decode(bytes.get_data() ?? new Uint8Array())};
    }

    destroy() {
        this._session.abort();
    }
}
