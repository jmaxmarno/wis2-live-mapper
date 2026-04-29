/**
 * Map Viewer
 *
 * Renders WIS2 messages with valid geometry as Leaflet markers. Driven by
 * RecentMessages add/remove events: a marker exists exactly while its
 * message is in the buffer. After the configured fade duration the marker
 * transitions to a "ghost" grey style and stays put until the buffer
 * FIFO-evicts it.
 */
class MapViewer {
    constructor(containerId, config) {
        this.containerId = containerId;
        this.config = config;
        this.map = null;
        this.markers = new Map(); // id -> { marker, fadeRaf }
        this.fadeDuration = config.settings.markerFadeDuration * 1000;
    }

    init() {
        this.map = L.map(this.containerId, {
            center: this.config.settings.defaultCenter,
            zoom: this.config.settings.defaultZoom,
            zoomControl: true
        });

        const baseLayers = {
            "Minimal": L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors, © CARTO'
            }),
            "OpenStreetMap": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '© OpenStreetMap contributors'
            }),
            "OpenTopoMap": L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                maxZoom: 17,
                attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)'
            }),
            "Satellite": L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: 'Tiles © Esri'
            })
        };

        baseLayers["Minimal"].addTo(this.map);
        L.control.layers(baseLayers).addTo(this.map);
        console.log('Map initialized');
    }

    /** Wire to a RecentMessages instance. */
    bindBuffer(recentMessages) {
        recentMessages.onAdd((msg) => this.onMessageAdded(msg));
        recentMessages.onRemove((msg) => this.onMessageRemoved(msg));
    }

    onMessageAdded(parsedMessage) {
        if (!parsedMessage || !parsedMessage.geometry) return;

        let marker = null;
        const t = parsedMessage.geometry.type;
        if (t === 'Point') marker = this.createPointMarker(parsedMessage);
        else if (t === 'Polygon' || t === 'MultiPolygon') marker = this.createPolygonMarker(parsedMessage);
        else if (t === 'LineString' || t === 'MultiLineString') marker = this.createLineMarker(parsedMessage);
        if (!marker) return;

        marker.addTo(this.map);
        this.markers.set(parsedMessage.id, { marker, fadeRaf: null });
        this.startFade(parsedMessage.id, marker);
    }

    onMessageRemoved(parsedMessage) {
        const entry = this.markers.get(parsedMessage.id);
        if (!entry) return;
        if (entry.fadeRaf) cancelAnimationFrame(entry.fadeRaf);
        try { entry.marker.remove(); } catch (e) {}
        this.markers.delete(parsedMessage.id);
    }

    createPointMarker(parsedMessage) {
        const [lon, lat] = parsedMessage.geometry.coordinates;
        const marker = L.circleMarker([lat, lon], {
            radius: this.config.settings.markerSize,
            fillColor: parsedMessage.color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            className: 'marker-fade'
        });
        marker.bindPopup(this.createPopupContent(parsedMessage));
        return marker;
    }

    createPolygonMarker(parsedMessage) {
        let coordinates;
        if (parsedMessage.geometry.type === 'Polygon') {
            coordinates = parsedMessage.geometry.coordinates[0].map(c => [c[1], c[0]]);
        } else {
            coordinates = parsedMessage.geometry.coordinates[0][0].map(c => [c[1], c[0]]);
        }
        const polygon = L.polygon(coordinates, {
            fillColor: parsedMessage.color,
            color: parsedMessage.color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.3,
            className: 'marker-fade'
        });
        polygon.bindPopup(this.createPopupContent(parsedMessage));
        return polygon;
    }

    createLineMarker(parsedMessage) {
        let coordinates;
        if (parsedMessage.geometry.type === 'LineString') {
            coordinates = parsedMessage.geometry.coordinates.map(c => [c[1], c[0]]);
        } else {
            coordinates = parsedMessage.geometry.coordinates[0].map(c => [c[1], c[0]]);
        }
        const polyline = L.polyline(coordinates, {
            color: parsedMessage.color,
            weight: 3,
            opacity: 0.8,
            className: 'marker-fade'
        });
        polyline.bindPopup(this.createPopupContent(parsedMessage));
        return polyline;
    }

    createPopupContent(parsedMessage) {
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        let html = '<div style="min-width: 220px;">';
        html += `<div class="popup-field"><div class="popup-label">Topic</div><div class="popup-value" style="font-size: 0.75rem; word-break: break-all;">${esc(parsedMessage.topic)}</div></div>`;
        html += `<div class="popup-field"><div class="popup-label">Category</div><div class="popup-value">${esc(parsedMessage.category)}</div></div>`;
        if (parsedMessage.pubtime) {
            html += `<div class="popup-field"><div class="popup-label">Published</div><div class="popup-value">${esc(new Date(parsedMessage.pubtime).toLocaleString())}</div></div>`;
        }
        if (parsedMessage.geometry && parsedMessage.geometry.type === 'Point') {
            const [lon, lat] = parsedMessage.geometry.coordinates;
            html += `<div class="popup-field"><div class="popup-label">Coordinates</div><div class="popup-value">${lat.toFixed(4)}, ${lon.toFixed(4)}</div></div>`;
        }
        html += `<button class="popup-details-btn" data-msg-id="${esc(parsedMessage.id)}">View details &amp; GDC links</button>`;
        html += '</div>';
        return html;
    }

    /**
     * Animate a marker from its full color to a grey "ghost" style over
     * fadeDuration. The marker is NOT removed when the fade completes —
     * it stays buffered until FIFO eviction.
     */
    startFade(id, marker) {
        const startTime = Date.now();
        const duration = this.fadeDuration;
        const ghostFill = '#9ca3af';
        const ghostStroke = '#6b7280';

        const animate = () => {
            const entry = this.markers.get(id);
            if (!entry) return; // marker removed
            const progress = Math.min((Date.now() - startTime) / duration, 1);

            try {
                if (progress >= 1) {
                    marker.setStyle({
                        fillColor: ghostFill,
                        color: ghostStroke,
                        weight: 1,
                        opacity: 0.55,
                        fillOpacity: 0.35
                    });
                    entry.fadeRaf = null;
                    return;
                }
                marker.setStyle({
                    opacity: 1 - 0.45 * progress,
                    fillOpacity: 0.8 - 0.45 * progress
                });
            } catch (e) {
                return;
            }
            entry.fadeRaf = requestAnimationFrame(animate);
        };

        const entry = this.markers.get(id);
        if (entry) entry.fadeRaf = requestAnimationFrame(animate);
    }

    clearAllMarkers() {
        for (const { marker, fadeRaf } of this.markers.values()) {
            if (fadeRaf) cancelAnimationFrame(fadeRaf);
            try { marker.remove(); } catch (e) {}
        }
        this.markers.clear();
    }

    getMarkerCount() {
        return this.markers.size;
    }
}
