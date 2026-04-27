/**
 * Statistics Panel
 * Manages the topic hierarchy tree and message statistics
 */
class StatsPanel {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.topicTree = {};
        this.topicCounts = {};
        this.filterCallbacks = [];
        this.activeFilters = new Set();
        this.expandedTopics = new Set();
    }

    /**
     * Update statistics for a topic
     * @param {string} topic - Full topic path
     * @param {object} parsedMessage - Parsed message
     */
    updateTopic(topic, parsedMessage) {
        // Increment count
        if (!this.topicCounts[topic]) {
            this.topicCounts[topic] = 0;
        }
        this.topicCounts[topic]++;

        // Update parent topics counts
        const parts = topic.split('/');
        for (let i = 1; i < parts.length; i++) {
            const parentTopic = parts.slice(0, i).join('/');
            if (!this.topicCounts[parentTopic]) {
                this.topicCounts[parentTopic] = 0;
            }
            this.topicCounts[parentTopic]++;
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
            const hasChildren = Object.keys(node.children).length > 0;
            const isExpanded = this.expandedTopics.has(node.fullPath);
            const isFiltered = this.activeFilters.has(node.category);

            html += '<div class="topic-item-container">';
            html += `<div class="topic-item ${isFiltered ? 'filtered' : ''}" data-topic="${node.fullPath}" data-category="${node.category || ''}">`;

            // Indentation
            html += '<span style="display: inline-block; width: ' + (depth * 1) + 'rem;"></span>';

            // Expand/collapse icon
            if (hasChildren) {
                html += `<span class="topic-expand ${isExpanded ? 'expanded' : ''}" data-action="toggle">`;
                html += '▸';
                html += '</span>';
            } else {
                html += '<span style="display: inline-block; width: 16px;"></span>';
            }

            // Color indicator for top-level topics
            if (node.color) {
                html += `<span class="topic-color-indicator" style="background-color: ${node.color};"></span>`;
            }

            // Topic name
            html += `<span class="flex-1 topic-name">${node.name}</span>`;

            // Count
            html += `<span class="topic-count">${count.toLocaleString()}</span>`;

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
