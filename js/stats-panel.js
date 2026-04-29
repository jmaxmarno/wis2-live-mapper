/**
 * Statistics Panel
 *
 * View over a RecentMessages buffer. Counts at every topic-hierarchy
 * level reflect what's currently buffered (decremented when messages
 * FIFO-evict). Clicking a row expands/collapses; the ⋯ icon next to the
 * count opens the message-list modal for that topic prefix; the ⚠ badge
 * opens the same modal pre-filtered to no-geometry messages.
 */
class StatsPanel {
    constructor(containerId, gdcs) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.gdcs = gdcs || [];
        this.topicTree = {};
        this.topicCounts = {};
        this.noGeoCounts = {};
        this.expandedTopics = new Set();
        this.browseHandler = null; // (topicPrefix, { noGeoOnly }) => void
    }

    /** Wire to a RecentMessages instance — listen for buffer add/remove. */
    bindBuffer(recentMessages) {
        recentMessages.onAdd((msg) => this.onMessageAdded(msg));
        recentMessages.onRemove((msg) => this.onMessageRemoved(msg));
    }

    /** Provide the callback used by ⋯ and ⚠ clicks to open the list modal. */
    onBrowseRequest(callback) {
        this.browseHandler = callback;
    }

    onMessageAdded(parsedMessage) {
        const isNoGeo = !parsedMessage.hasGeometry;
        const parts = parsedMessage.topic.split('/');

        // Cumulative counts at every prefix level
        for (let i = 1; i <= parts.length; i++) {
            const path = parts.slice(0, i).join('/');
            this.topicCounts[path] = (this.topicCounts[path] || 0) + 1;
            if (isNoGeo) this.noGeoCounts[path] = (this.noGeoCounts[path] || 0) + 1;
        }

        this.buildTopicTree(parsedMessage.topic, parsedMessage);
        this._scheduleRender();
    }

    onMessageRemoved(parsedMessage) {
        const isNoGeo = !parsedMessage.hasGeometry;
        const parts = parsedMessage.topic.split('/');

        for (let i = 1; i <= parts.length; i++) {
            const path = parts.slice(0, i).join('/');
            if (this.topicCounts[path]) this.topicCounts[path]--;
            if (isNoGeo && this.noGeoCounts[path]) this.noGeoCounts[path]--;
        }

        // Rows are kept even at count 0 (Q5).
        this._scheduleRender();
    }

    buildTopicTree(topic, parsedMessage) {
        const parts = topic.split('/');
        let level = this.topicTree;
        parts.forEach((part, i) => {
            if (!level[part]) {
                const fullPath = parts.slice(0, i + 1).join('/');
                level[part] = {
                    name: part,
                    fullPath,
                    children: {},
                    category: i === 0 ? part : null,
                    color: i === 0 ? parsedMessage.color : null
                };
            }
            level = level[part].children;
        });
    }

    _scheduleRender() {
        if (this.renderTimeout) return;
        this.renderTimeout = setTimeout(() => {
            this.render();
            this.renderTimeout = null;
        }, 100);
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = this.renderTopicLevel(this.topicTree, 0);
        this.attachEventListeners();
    }

    renderTopicLevel(level, depth) {
        let html = '';
        Object.keys(level).sort().forEach(key => {
            const node = level[key];
            const count = this.topicCounts[node.fullPath] || 0;
            const noGeoCount = this.noGeoCounts[node.fullPath] || 0;
            const hasChildren = Object.keys(node.children).length > 0;
            const isExpanded = this.expandedTopics.has(node.fullPath);
            const path = escapeHtml(node.fullPath);

            html += '<div class="topic-item-container">';
            html += `<div class="topic-item" data-topic="${path}">`;
            html += `<span class="topic-indent" style="width: ${depth}rem;"></span>`;
            if (hasChildren) {
                html += `<span class="topic-expand ${isExpanded ? 'expanded' : ''}">▸</span>`;
            } else {
                html += '<span class="topic-spacer"></span>';
            }
            if (node.color) {
                html += `<span class="topic-color-indicator" style="background-color: ${node.color};"></span>`;
            }
            html += `<span class="topic-name">${escapeHtml(node.name)}</span>`;
            html += `<span class="topic-count">${count.toLocaleString()}</span>`;

            // Browse icon — opens list modal for "all messages with this prefix"
            if (count > 0) {
                html += `<span class="topic-browse-icon" data-action="browse-topic" data-topic="${path}" title="View buffered messages for this topic">⋯</span>`;
            }
            // No-geo badge — opens same modal pre-filtered to no-geometry only
            if (noGeoCount > 0) {
                html += `<span class="topic-nogeo-count" data-action="browse-nogeo" data-topic="${path}" title="${noGeoCount} buffered messages without geometry — click to view">⚠ ${noGeoCount.toLocaleString()}</span>`;
            }
            html += '</div>';

            if (hasChildren && isExpanded) {
                html += '<div class="topic-children">';
                html += this.renderTopicLevel(node.children, depth + 1);
                html += '</div>';
            }
            html += '</div>';
        });
        return html;
    }

    attachEventListeners() {
        const items = this.container.querySelectorAll('.topic-item');
        items.forEach(item => {
            const topic = item.dataset.topic;
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'browse-topic') {
                    e.stopPropagation();
                    if (this.browseHandler) this.browseHandler(e.target.dataset.topic, { noGeoOnly: false });
                    return;
                }
                if (action === 'browse-nogeo') {
                    e.stopPropagation();
                    if (this.browseHandler) this.browseHandler(e.target.dataset.topic, { noGeoOnly: true });
                    return;
                }
                // Anywhere else on the row → expand/collapse
                this.toggleExpand(topic);
            });
        });
    }

    toggleExpand(topic) {
        if (this.expandedTopics.has(topic)) this.expandedTopics.delete(topic);
        else this.expandedTopics.add(topic);
        this.render();
    }

    clear() {
        this.topicTree = {};
        this.topicCounts = {};
        this.noGeoCounts = {};
        this.render();
    }
}
