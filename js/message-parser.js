/**
 * Message Parser
 * Parses WIS2 notification messages according to the schema.
 * Reference: https://github.com/wmo-im/wis2-notification-message
 */
class MessageParser {
    /**
     * @param {Object<string, string>} categoryColors map of "origin"/"cache"/"monitor" → hex color
     */
    constructor(categoryColors) {
        this.categoryColors = categoryColors || {};
    }

    parse(topic, payload) {
        try {
            const message = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const geometry = this.extractGeometry(message);
            const category = this.getTopicCategory(topic);
            const color = this.categoryColors[category] || '#6B7280';

            return {
                id: message.id || this.generateId(),
                topic,
                category,
                color,
                geometry,
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

    extractGeometry(message) {
        if (this.isValidGeometry(message.geometry)) return message.geometry;
        if (this.isValidGeometry(message.properties?.geometry)) return message.properties.geometry;

        // Fall back to bbox center if available
        const bbox = message.properties?.bbox || message.bbox;
        if (Array.isArray(bbox) && bbox.length >= 4) {
            const [minLon, minLat, maxLon, maxLat] = bbox;
            return { type: 'Point', coordinates: [(minLon + maxLon) / 2, (minLat + maxLat) / 2] };
        }
        return null;
    }

    isValidGeometry(geometry) {
        if (!geometry || !geometry.type || !geometry.coordinates) return false;
        return ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']
            .includes(geometry.type);
    }

    getTopicCategory(topic) {
        if (topic.startsWith('origin/')) return 'origin';
        if (topic.startsWith('cache/'))  return 'cache';
        if (topic.startsWith('monitor/')) return 'monitor';
        return 'unknown';
    }

    generateId() {
        return 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
    }
}
