/**
 * Statistics Panel
 * Manages the topic hierarchy tree and message statistics
 */
class StatsPanel {
    constructor(containerId, gdcs) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.gdcs = gdcs || [];
        this.topicTree = {};
        this.topicCounts = {};
        this.noGeoCounts = {};
        this.recentNoGeo = [];
        this.maxRecentNoGeo = 500;
        this.filterCallbacks = [];
        this.activeFilters = new Set();
        this.expandedTopics = new Set();
        this.setupNoGeoModal();
    }

    setupNoGeoModal() {
        const modal = document.getElementById('nogeo-modal');
        const closeBtn = document.getElementById('close-nogeo-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        }
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'nogeo-modal') modal.classList.remove('active');
            });
        }
    }

    /**
     * Update statistics for a topic
     * @param {string} topic - Full topic path
     * @param {object} parsedMessage - Parsed message
     */
    updateTopic(topic, parsedMessage) {
        const isNoGeo = !parsedMessage.hasGeometry;

        // Increment count
        if (!this.topicCounts[topic]) this.topicCounts[topic] = 0;
        this.topicCounts[topic]++;
        if (isNoGeo) {
            if (!this.noGeoCounts[topic]) this.noGeoCounts[topic] = 0;
            this.noGeoCounts[topic]++;
        }

        // Update parent topics counts
        const parts = topic.split('/');
        for (let i = 1; i < parts.length; i++) {
            const parentTopic = parts.slice(0, i).join('/');
            if (!this.topicCounts[parentTopic]) this.topicCounts[parentTopic] = 0;
            this.topicCounts[parentTopic]++;
            if (isNoGeo) {
                if (!this.noGeoCounts[parentTopic]) this.noGeoCounts[parentTopic] = 0;
                this.noGeoCounts[parentTopic]++;
            }
        }

        // Keep a capped buffer of recent no-geometry messages so they're explorable
        if (isNoGeo) {
            this.recentNoGeo.unshift({
                topic: topic,
                pubtime: parsedMessage.pubtime,
                dataId: parsedMessage.dataId,
                metadataId: parsedMessage.metadataId,
                links: parsedMessage.links || [],
                receivedAt: Date.now()
            });
            if (this.recentNoGeo.length > this.maxRecentNoGeo) {
                this.recentNoGeo.length = this.maxRecentNoGeo;
            }
        }

        // Build tree structure if needed
        this.buildTopicTree(topic, parsedMessage);

        // Debounced render
        if (!this.renderTimeout) {
            this.renderTimeout = setTimeout(() => {
                this.render();
                this.renderTimeout = null;
            }, 100);
        }
    }

    /**
     * Build topic tree structure
     * @param {string} topic - Full topic path
     * @param {object} parsedMessage - Parsed message
     */
    buildTopicTree(topic, parsedMessage) {
        const parts = topic.split('/');
        let currentLevel = this.topicTree;

        parts.forEach((part, index) => {
            if (!currentLevel[part]) {
                const fullPath = parts.slice(0, index + 1).join('/');
                currentLevel[part] = {
                    name: part,
                    fullPath: fullPath,
                    children: {},
                    category: index === 0 ? part : null,
                    color: index === 0 ? parsedMessage.color : null
                };
            }
            currentLevel = currentLevel[part].children;
        });
    }

    /**
     * Render the topic tree
     */
    render() {
        if (!this.container) return;

        const html = this.renderTopicLevel(this.topicTree, 0);
        this.container.innerHTML = html;

        // Attach event listeners
        this.attachEventListeners();
    }

    /**
     * Render a level of the topic tree
     * @param {object} level - Tree level object
     * @param {number} depth - Current depth
     * @returns {string} HTML string
     */
    renderTopicLevel(level, depth) {
        let html = '';

        Object.keys(level).sort().forEach(key => {
            const node = level[key];
            const count = this.topicCounts[node.fullPath] || 0;
            const noGeoCount = this.noGeoCounts[node.fullPath] || 0;
            const hasChildren = Object.keys(node.children).length > 0;
            const isExpanded = this.expandedTopics.has(node.fullPath);
            const isFiltered = this.activeFilters.has(node.category);
            const fullPathAttr = this.escapeHtml(node.fullPath);

            html += '<div class="topic-item-container">';
            html += `<div class="topic-item ${isFiltered ? 'filtered' : ''}" data-topic="${fullPathAttr}" data-category="${this.escapeHtml(node.category || '')}">`;

            // Indentation
            html += `<span class="topic-indent" style="width: ${depth}rem;"></span>`;

            // Expand/collapse icon
            if (hasChildren) {
                html += `<span class="topic-expand ${isExpanded ? 'expanded' : ''}" data-action="toggle">▸</span>`;
            } else {
                html += '<span class="topic-spacer"></span>';
            }

            // Color indicator for top-level topics
            if (node.color) {
                html += `<span class="topic-color-indicator" style="background-color: ${node.color};"></span>`;
            }

            // Topic name
            html += `<span class="topic-name">${this.escapeHtml(node.name)}</span>`;

            // Count
            html += `<span class="topic-count">${count.toLocaleString()}</span>`;

            // No-geometry badge — click to explore those messages
            if (noGeoCount > 0) {
                html += `<span class="topic-nogeo-count" data-action="show-nogeo" data-topic="${fullPathAttr}" title="${noGeoCount} messages without geometry — click to view">⚠ ${noGeoCount.toLocaleString()}</span>`;
            }

            html += '</div>';

            // Children (if expanded)
            if (hasChildren && isExpanded) {
                html += '<div class="topic-children">';
                html += this.renderTopicLevel(node.children, depth + 1);
                html += '</div>';
            }

            html += '</div>';
        });

        return html;
    }

    renderGdcLinksFor(noGeoItem) {
        if (!this.gdcs || this.gdcs.length === 0) return '';
        if (typeof GDCLinks === 'undefined') return '';

        // The buffered no-geo entry doesn't carry the topic in the shape buildAllLinks expects
        // beyond what we stored — it has topic, metadataId. Adapt minimally.
        const linkSet = GDCLinks.buildAllLinks(
            { topic: noGeoItem.topic, metadataId: noGeoItem.metadataId },
            this.gdcs
        );
        if (linkSet.links.length === 0) return '';

        const escAttr = (s) => this.escapeHtml(s);
        const buttons = linkSet.links.map(l =>
            `<a class="gdc-link" href="${escAttr(l.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(l.name)} <span aria-hidden="true">↗</span></a>`
        ).join('');

        const label = linkSet.kind === 'record'
            ? 'GDC record:'
            : `GDC search (centre <code>${this.escapeHtml(linkSet.centre)}</code>):`;

        return `<div class="payload-gdc-section mt-2"><div class="gdc-section-label">${label}</div><div class="gdc-link-list">${buttons}</div></div>`;
    }

    escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    showNoGeoMessages(topicPrefix) {
        const modal = document.getElementById('nogeo-modal');
        const list = document.getElementById('nogeo-list');
        const topicLabel = document.getElementById('nogeo-topic-filter');
        const countLabel = document.getElementById('nogeo-count-label');
        if (!modal || !list) return;

        if (topicLabel) topicLabel.textContent = topicPrefix;

        const matching = this.recentNoGeo.filter(m =>
            m.topic === topicPrefix || m.topic.startsWith(topicPrefix + '/')
        );
        const totalForTopic = this.noGeoCounts[topicPrefix] || 0;
        if (countLabel) {
            countLabel.textContent = `Showing ${matching.length.toLocaleString()} of ${totalForTopic.toLocaleString()} (buffer keeps the most recent ${this.maxRecentNoGeo})`;
        }

        if (matching.length === 0) {
            list.innerHTML = '<div class="text-muted text-sm">No recent messages buffered for this topic.</div>';
        } else {
            list.innerHTML = matching.slice(0, 100).map(m => {
                const linksHtml = (m.links || []).map(l =>
                    `<a href="${this.escapeHtml(l.href)}" target="_blank" rel="noopener noreferrer" class="nogeo-link">${this.escapeHtml(l.rel || 'link')}: ${this.escapeHtml(l.href)}</a>`
                ).join('');
                const gdcHtml = this.renderGdcLinksFor(m);
                return `
                    <div class="nogeo-item">
                        <div class="text-xs text-muted break-all mb-1">${this.escapeHtml(m.topic)}</div>
                        <div class="mb-1"><span class="text-muted">pubtime:</span> ${this.escapeHtml(m.pubtime || '—')}</div>
                        ${m.dataId ? `<div class="break-all mb-1"><span class="text-muted">data_id:</span> ${this.escapeHtml(m.dataId)}</div>` : ''}
                        ${linksHtml ? `<div class="mt-2 space-y-1">${linksHtml}</div>` : ''}
                        ${gdcHtml}
                    </div>
                `;
            }).join('');
        }

        modal.classList.add('active');
    }

    /**
     * Attach event listeners to topic items
     */
    attachEventListeners() {
        const topicItems = this.container.querySelectorAll('.topic-item');

        topicItems.forEach(item => {
            const topic = item.dataset.topic;
            const category = item.dataset.category;

            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;

                if (action === 'toggle') {
                    // Toggle expand/collapse
                    e.stopPropagation();
                    this.toggleExpand(topic);
                } else if (action === 'show-nogeo') {
                    // Open the no-geometry message viewer for this topic prefix
                    e.stopPropagation();
                    this.showNoGeoMessages(e.target.dataset.topic);
                } else if (category) {
                    // Toggle filter for top-level categories
                    this.toggleFilter(category);
                }
            });
        });
    }

    /**
     * Toggle expand/collapse for a topic
     * @param {string} topic - Topic path
     */
    toggleExpand(topic) {
        if (this.expandedTopics.has(topic)) {
            this.expandedTopics.delete(topic);
        } else {
            this.expandedTopics.add(topic);
        }
        this.render();
    }

    /**
     * Toggle filter for a category
     * @param {string} category - Category name (origin, cache, monitor)
     */
    toggleFilter(category) {
        if (!category) return;

        if (this.activeFilters.has(category)) {
            this.activeFilters.delete(category);
        } else {
            this.activeFilters.add(category);
        }

        // Notify callbacks
        this.filterCallbacks.forEach(callback => {
            try {
                callback(this.activeFilters);
            } catch (error) {
                console.error('Error in filter callback:', error);
            }
        });

        this.render();
    }

    /**
     * Register a filter change callback
     * @param {function} callback - Callback function
     */
    onFilterChange(callback) {
        this.filterCallbacks.push(callback);
    }

    /**
     * Get total message count
     * @returns {number} Total count
     */
    getTotalCount() {
        let total = 0;
        Object.values(this.topicCounts).forEach(count => {
            total += count;
        });
        // Divide by depth to avoid counting parent topics
        return Math.max(...Object.values(this.topicCounts));
    }

    /**
     * Clear all statistics
     */
    clear() {
        this.topicTree = {};
        this.topicCounts = {};
        this.noGeoCounts = {};
        this.recentNoGeo = [];
        this.render();
    }

    /**
     * Get counts by category
     * @returns {object} Counts by category
     */
    getCategoryCounts() {
        const counts = {
            origin: this.topicCounts['origin'] || 0,
            cache: this.topicCounts['cache'] || 0,
            monitor: this.topicCounts['monitor'] || 0
        };
        return counts;
    }
}
