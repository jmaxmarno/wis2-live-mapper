/**
 * RecentMessages — single buffer of recently received WIS2 messages.
 *
 * Map and StatsPanel are views over this. Eviction is FIFO by total
 * buffer bytes (approximate JSON size of the raw payloads); messages
 * stay buffered as long as they fit, and the map renders a "ghosted"
 * (grey) marker for points whose color fade has completed but whose
 * message is still in the buffer.
 *
 * Events:
 *   onAdd(parsedMessage)    — fires after a message is added
 *   onRemove(parsedMessage) — fires after a message is FIFO-evicted or cleared
 */
class RecentMessages {
    constructor(maxBytes) {
        this.maxBytes = Math.max(1024, maxBytes | 0);
        this.byId = new Map(); // id -> { msg, bytes, receivedAt } in insertion (FIFO) order
        this.totalBytes = 0;
        this.addListeners = [];
        this.removeListeners = [];
    }

    setMaxBytes(n) {
        this.maxBytes = Math.max(1024, n | 0);
        this._enforceLimit();
    }

    add(parsedMessage) {
        if (!parsedMessage || !parsedMessage.id) return;
        const id = parsedMessage.id;

        // Re-receiving the same id moves it to the most-recent end of the buffer.
        if (this.byId.has(id)) {
            this.totalBytes -= this.byId.get(id).bytes;
            this.byId.delete(id);
        }

        const bytes = RecentMessages._estimateBytes(parsedMessage);
        const entry = { msg: parsedMessage, bytes, receivedAt: Date.now() };
        this.byId.set(id, entry);
        this.totalBytes += bytes;

        this._fire('add', parsedMessage);
        this._enforceLimit();
    }

    get(id) {
        const entry = this.byId.get(id);
        return entry ? entry.msg : null;
    }

    has(id) {
        return this.byId.has(id);
    }

    /** Number of currently buffered messages. */
    size() {
        return this.byId.size;
    }

    /** Total buffer size in bytes (approximate, based on JSON length of raw payloads). */
    byteSize() {
        return this.totalBytes;
    }

    /** Timestamp (Date.now ms) at which the oldest buffered message was received, or null. */
    oldestReceivedAt() {
        const first = this.byId.values().next().value;
        return first ? first.receivedAt : null;
    }

    /**
     * Iterate messages whose topic === prefix or starts with prefix + '/'.
     * Returned array is most-recent first.
     */
    findByTopicPrefix(prefix) {
        const matches = [];
        for (const { msg } of this.byId.values()) {
            if (msg.topic === prefix || (typeof msg.topic === 'string' && msg.topic.startsWith(prefix + '/'))) {
                matches.push(msg);
            }
        }
        return matches.reverse();
    }

    clear() {
        const removed = Array.from(this.byId.values()).map(e => e.msg);
        this.byId.clear();
        this.totalBytes = 0;
        for (const msg of removed) this._fire('remove', msg);
    }

    onAdd(fn)    { this.addListeners.push(fn); }
    onRemove(fn) { this.removeListeners.push(fn); }

    _enforceLimit() {
        while (this.byId.size > 0 && this.totalBytes > this.maxBytes) {
            const oldestId = this.byId.keys().next().value;
            const entry = this.byId.get(oldestId);
            this.byId.delete(oldestId);
            this.totalBytes -= entry.bytes;
            this._fire('remove', entry.msg);
        }
    }

    _fire(kind, msg) {
        const list = kind === 'add' ? this.addListeners : this.removeListeners;
        for (const fn of list) {
            try { fn(msg); } catch (e) { console.error(`RecentMessages.${kind} listener:`, e); }
        }
    }

    /**
     * Approximate the in-memory cost of a parsed message via the JSON length
     * of its raw payload. Cheap, ASCII-leaning estimate — actual JS object
     * overhead is ~2× this — but good enough for a "tens of MB" user-facing
     * cap. Falls back to 1 KB on serialization failure.
     */
    static _estimateBytes(parsedMessage) {
        try {
            return JSON.stringify(parsedMessage.raw ?? parsedMessage).length;
        } catch (e) {
            return 1024;
        }
    }
}
