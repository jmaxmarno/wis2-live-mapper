/**
 * Message Parser
 * Parses WIS2 notification messages according to the schema
 * Reference: https://github.com/wmo-im/wis2-notification-message
 */
class MessageParser {
    constructor() {
        this.topicColors = {
            'origin': '#3B82F6',
            'cache': '#10B981',
            'monitor': '#F59E0B'
        };
    }

    /**
     * Parse a WIS2 notification message
     * @param {string} topic - MQTT topic
     * @param {string|object} payload - Message payload
     * @returns {object|null} Parsed message or null if invalid
     */
    parse(topic, payload) {
        try {
            // Parse JSON if string
            const message = typeof payload === 'string' ? JSON.parse(payload) : payload;

            // Extract geometry (may be null — message is still kept for stats)
            const geometry = this.extractGeometry(message);

            // Determine topic category
            const category = this.getTopicCategory(topic);
            const color = this.topicColors[category] || '#6B7280';

            // Build parsed message object
            return {
                id: message.id || this.generateId(),
                topic: topic,
                category: category,
                color: color,
                geometry: geometry,
                hasGeometry: !!geometry,
                properties: message.properties || {},
                pubtime: message.properties?.pubtime || new Date().toISOString(),
                dataId: message.properties?.data_id,
                metadataId: message.properties?.metadata_id,
                links: message.links || [],
                raw: message
            };
        } catch (error) {
            console.error('Error parsing message:', error, payload);
            return null;
        }
    }

    /**
     * Extract GeoJSON geometry from message
     * @param {object} message - WIS2 notification message
     * @returns {object|null} GeoJSON geometry or null
     */
    extractGeometry(message) {
        // Check for direct geometry property
        if (message.geometry) {
            if (this.isValidGeometry(message.geometry)) {
                return message.geometry;
            }
        }

        // Check if the message itself is a GeoJSON Feature
        if (message.type === 'Feature' && message.geometry) {
            if (this.isValidGeometry(message.geometry)) {
                return message.geometry;
            }
        }

        // Check in properties
        if (message.properties?.geometry) {
            if (this.isValidGeometry(message.properties.geometry)) {
                return message.properties.geometry;
            }
        }

        // Try to extract from bbox if available
        if (message.properties?.bbox || message.bbox) {
            const bbox = message.properties?.bbox || message.bbox;
            return this.bboxToGeometry(bbox);
        }

        return null;
    }

    /**
     * Validate GeoJSON geometry
     * @param {object} geometry - Geometry object
     * @returns {boolean} True if valid
     */
    isValidGeometry(geometry) {
        if (!geometry || !geometry.type || !geometry.coordinates) {
            return false;
        }

        const validTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'];
        return validTypes.includes(geometry.type);
    }

    /**
     * Convert bbox to geometry
     * @param {array} bbox - Bounding box [minLon, minLat, maxLon, maxLat]
     * @returns {object} GeoJSON geometry
     */
    bboxToGeometry(bbox) {
        if (!Array.isArray(bbox) || bbox.length < 4) {
            return null;
        }

        const [minLon, minLat, maxLon, maxLat] = bbox;

        // Return center point of bbox
        return {
            type: 'Point',
            coordinates: [(minLon + maxLon) / 2, (minLat + maxLat) / 2]
        };
    }

    /**
     * Determine topic category (origin, cache, monitor)
     * @param {string} topic - MQTT topic
     * @returns {string} Category name
     */
    getTopicCategory(topic) {
        if (topic.startsWith('origin/')) {
            return 'origin';
        } else if (topic.startsWith('cache/')) {
            return 'cache';
        } else if (topic.startsWith('monitor/')) {
            return 'monitor';
        }
        return 'unknown';
    }

    /**
     * Parse topic into hierarchy
     * @param {string} topic - MQTT topic
     * @returns {array} Topic parts
     */
    parseTopicHierarchy(topic) {
        return topic.split('/').filter(part => part.length > 0);
    }

    /**
     * Generate a random ID
     * @returns {string} Random ID
     */
    generateId() {
        return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Format message for display
     * @param {object} parsedMessage - Parsed message
     * @returns {string} HTML formatted message
     */
    formatForPopup(parsedMessage) {
        let html = '<div class="popup-content">';

        // Topic
        html += `<div class="popup-field">`;
        html += `<div class="popup-label">Topic</div>`;
        html += `<div class="popup-value">${parsedMessage.topic}</div>`;
        html += `</div>`;

        // Category
        html += `<div class="popup-field">`;
        html += `<div class="popup-label">Category</div>`;
        html += `<div class="popup-value">${parsedMessage.category}</div>`;
        html += `</div>`;

        // Pub Time
        if (parsedMessage.pubtime) {
            html += `<div class="popup-field">`;
            html += `<div class="popup-label">Published</div>`;
            html += `<div class="popup-value">${new Date(parsedMessage.pubtime).toLocaleString()}</div>`;
            html += `</div>`;
        }

        // Data ID
        if (parsedMessage.dataId) {
            html += `<div class="popup-field">`;
            html += `<div class="popup-label">Data ID</div>`;
            html += `<div class="popup-value">${parsedMessage.dataId}</div>`;
            html += `</div>`;
        }

        // Coordinates
        if (parsedMessage.geometry.type === 'Point') {
            const [lon, lat] = parsedMessage.geometry.coordinates;
            html += `<div class="popup-field">`;
            html += `<div class="popup-label">Coordinates</div>`;
            html += `<div class="popup-value">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>`;
            html += `</div>`;
        }

        html += '</div>';
        return html;
    }
}
