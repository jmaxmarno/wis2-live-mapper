/**
 * RecentMessages — single buffer of recently received WIS2 messages.
 *
 * Map and StatsPanel are views over this. Eviction is purely FIFO at
 * maxSize; messages stay buffered as long as they fit, and the map
 * renders a "ghosted" (grey) marker for points whose color fade has
 * completed but which are still in the buffer.
 *
 * Events:
 *   onAdd(parsedMessage)    — fires after a message is added
 *   onRemove(parsedMessage) — fires after a message is FIFO-evicted or cleared
 */
class RecentMessages {
    constructor(maxSize) {
        this.maxSize = Math.max(1, maxSize | 0);
        this.byId = new Map(); // insertion order = FIFO order
        this.addListeners = [];
        this.removeListeners = [];
    }

    setMaxSize(n) {
        this.maxSize = Math.max(1, n | 0);
        this._enforceLimit();
    }

    add(parsedMessage) {
        if (!parsedMessage || !parsedMessage.id) return;
        const id = parsedMessage.id;
        // Re-receiving the same id moves it to the most-recent end of the buffer.
        if (this.byId.has(id)) this.byId.delete(id);
        this.byId.set(id, parsedMessage);
        this._fire('add', parsedMessage);
        this._enforceLimit();
    }

    get(id) {
        return this.byId.get(id) || null;
    }

    has(id) {
        return this.byId.has(id);
    }

    size() {
        return this.byId.size;
    }

    /**
     * Iterate messages whose topic === prefix or starts with prefix + '/'.
     * Returned array is most-recent first.
     */
    findByTopicPrefix(prefix) {
        const matches = [];
        for (const msg of this.byId.values()) {
            if (msg.topic === prefix || (typeof msg.topic === 'string' && msg.topic.startsWith(prefix + '/'))) {
                matches.push(msg);
            }
        }
        return matches.reverse();
    }

    clear() {
        const removed = Array.from(this.byId.values());
        this.byId.clear();
        for (const msg of removed) this._fire('remove', msg);
    }

    onAdd(fn) { this.addListeners.push(fn); }
    onRemove(fn) { this.removeListeners.push(fn); }

    _enforceLimit() {
        while (this.byId.size > this.maxSize) {
            const oldestId = this.byId.keys().next().value;
            const msg = this.byId.get(oldestId);
            this.byId.delete(oldestId);
            this._fire('remove', msg);
        }
    }

    _fire(kind, msg) {
        const list = kind === 'add' ? this.addListeners : this.removeListeners;
        for (const fn of list) {
            try { fn(msg); } catch (e) { console.error(`RecentMessages.${kind} listener:`, e); }
        }
    }
}
