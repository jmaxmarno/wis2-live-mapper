/**
 * Build deep links into WIS2 Global Discovery Catalogues.
 *
 * All deployed GDCs run pygeoapi (OGC API - Records). The notification
 * message's `properties.metadata_id` is the canonical record id, so a
 * record URL is pure URL templating — no API call needed.
 *
 * When metadata_id is empty (a publisher-side bug, but common in the wild)
 * we fall back to a centre-scoped search using the centre id parsed from
 * the WIS2 topic: <origin|cache|monitor>/a/wis2/<centre-id>/...
 */
const GDCLinks = {
    buildRecordUrl(gdcBase, metadataId) {
        return `${gdcBase}/collections/wis2-discovery-metadata/items/${encodeURIComponent(metadataId)}?f=html`;
    },

    buildCentreSearchUrl(gdcBase, centreId) {
        return `${gdcBase}/collections/wis2-discovery-metadata/items?q=${encodeURIComponent(centreId)}&f=html`;
    },

    extractCentreFromTopic(topic) {
        if (!topic) return null;
        const parts = topic.split('/');
        // origin|cache|monitor / a / wis2 / <centre-id>
        if (parts.length >= 4 && parts[2] === 'wis2') return parts[3];
        return null;
    },

    /**
     * Build the full set of GDC links for a parsed message.
     * @returns {{kind: 'record'|'centre'|'none', centre?: string, links: Array<{name, url}>}}
     */
    buildAllLinks(parsedMessage, gdcs) {
        if (!Array.isArray(gdcs) || gdcs.length === 0) {
            return { kind: 'none', links: [] };
        }

        const metadataId = parsedMessage && parsedMessage.metadataId;
        if (metadataId) {
            return {
                kind: 'record',
                links: gdcs.map(g => ({ name: g.name, url: this.buildRecordUrl(g.baseUrl, metadataId) }))
            };
        }

        const centre = this.extractCentreFromTopic(parsedMessage && parsedMessage.topic);
        if (centre) {
            return {
                kind: 'centre',
                centre,
                links: gdcs.map(g => ({ name: g.name, url: this.buildCentreSearchUrl(g.baseUrl, centre) }))
            };
        }

        return { kind: 'none', links: [] };
    }
};
