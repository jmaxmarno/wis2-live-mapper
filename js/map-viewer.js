/**
 * Map Viewer
 * Manages the Leaflet map and marker visualization
 */
class MapViewer {
    constructor(containerId, config) {
        this.containerId = containerId;
        this.config = config;
        this.map = null;
        this.markers = [];
        this.markerMap = new Map(); // id -> marker
        this.messageMap = new Map(); // id -> parsedMessage (for the payload modal)
        this.activeFilters = new Set();
        this.fadeDuration = config.settings.markerFadeDuration * 1000; // Convert to milliseconds
        this.maxMessages = config.settings.maxMessages;
    }

    /**
     * Initialize the map
     */
    init() {
        // Create map
        this.map = L.map(this.containerId, {
            center: this.config.settings.defaultCenter,
            zoom: this.config.settings.defaultZoom,
            zoomControl: true
        });

        // Define base layers — Minimal (CARTO light) is default to match the WMO white/blue theme
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

        // Add default layer (Minimal)
        baseLayers["Minimal"].addTo(this.map);

        // Add layer control
        L.control.layers(baseLayers).addTo(this.map);

        console.log('Map initialized');
    }

    /**
     * Add a message to the map
     * @param {object} parsedMessage - Parsed WIS2 message
     */
    addMessage(parsedMessage) {
        if (!parsedMessage || !parsedMessage.geometry) {
            return;
        }

        // Check if filtered
        if (this.activeFilters.size > 0 && !this.activeFilters.has(parsedMessage.category)) {
            return;
        }

        // Create marker based on geometry type
        let marker = null;

        if (parsedMessage.geometry.type === 'Point') {
            marker = this.createPointMarker(parsedMessage);
        } else if (parsedMessage.geometry.type === 'Polygon' || parsedMessage.geometry.type === 'MultiPolygon') {
            marker = this.createPolygonMarker(parsedMessage);
        } else if (parsedMessage.geometry.type === 'LineString' || parsedMessage.geometry.type === 'MultiLineString') {
            marker = this.createLineMarker(parsedMessage);
        }

        if (marker) {
            // Add to map
            marker.addTo(this.map);

            // Store marker + the parsed message so the details modal can find it on click
            this.markers.push({
                id: parsedMessage.id,
                marker: marker,
                category: parsedMessage.category,
                timestamp: Date.now()
            });
            this.markerMap.set(parsedMessage.id, marker);
            this.messageMap.set(parsedMessage.id, parsedMessage);

            // Start fade animation
            this.startFade(parsedMessage.id, marker);

            // Enforce max messages limit
            this.enforceMaxMessages();
        }
    }

    /**
     * Create a point marker
     * @param {object} parsedMessage - Parsed message
     * @returns {L.CircleMarker} Leaflet marker
     */
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

        // Add popup with message details
        const popupContent = this.createPopupContent(parsedMessage);
        marker.bindPopup(popupContent);

        return marker;
    }

    /**
     * Create a polygon marker
     * @param {object} parsedMessage - Parsed message
     * @returns {L.Polygon} Leaflet polygon
     */
    createPolygonMarker(parsedMessage) {
        // Convert coordinates to Leaflet format [lat, lon]
        let coordinates;
        if (parsedMessage.geometry.type === 'Polygon') {
            coordinates = parsedMessage.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        } else {
            // MultiPolygon - use first polygon
            coordinates = parsedMessage.geometry.coordinates[0][0].map(coord => [coord[1], coord[0]]);
        }

        const polygon = L.polygon(coordinates, {
            fillColor: parsedMessage.color,
            color: parsedMessage.color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.3,
            className: 'marker-fade'
        });

        const popupContent = this.createPopupContent(parsedMessage);
        polygon.bindPopup(popupContent);

        return polygon;
    }

    /**
     * Create a line marker
     * @param {object} parsedMessage - Parsed message
     * @returns {L.Polyline} Leaflet polyline
     */
    createLineMarker(parsedMessage) {
        let coordinates;
        if (parsedMessage.geometry.type === 'LineString') {
            coordinates = parsedMessage.geometry.coordinates.map(coord => [coord[1], coord[0]]);
        } else {
            // MultiLineString - use first line
            coordinates = parsedMessage.geometry.coordinates[0].map(coord => [coord[1], coord[0]]);
        }

        const polyline = L.polyline(coordinates, {
            color: parsedMessage.color,
            weight: 3,
            opacity: 0.8,
            className: 'marker-fade'
        });

        const popupContent = this.createPopupContent(parsedMessage);
        polyline.bindPopup(popupContent);

        return polyline;
    }

    /**
     * Create popup content for a marker
     * @param {object} parsedMessage - Parsed message
     * @returns {string} HTML content
     */
    createPopupContent(parsedMessage) {
        const esc = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

        let html = '<div style="min-width: 220px;">';

        html += `<div class="popup-field">`;
        html += `<div class="popup-label">Topic</div>`;
        html += `<div class="popup-value" style="font-size: 0.75rem; word-break: break-all;">${esc(parsedMessage.topic)}</div>`;
        html += `</div>`;

        html += `<div class="popup-field">`;
        html += `<div class="popup-label">Category</div>`;
        html += `<div class="popup-value">${esc(parsedMessage.category)}</div>`;
        html += `</div>`;

        if (parsedMessage.pubtime) {
            html += `<div class="popup-field">`;
            html += `<div class="popup-label">Published</div>`;
            html += `<div class="popup-value">${esc(new Date(parsedMessage.pubtime).toLocaleString())}</div>`;
            html += `</div>`;
        }

        if (parsedMessage.geometry && parsedMessage.geometry.type === 'Point') {
            const [lon, lat] = parsedMessage.geometry.coordinates;
            html += `<div class="popup-field">`;
            html += `<div class="popup-label">Coordinates</div>`;
            html += `<div class="popup-value">${lat.toFixed(4)}, ${lon.toFixed(4)}</div>`;
            html += `</div>`;
        }

        html += `<button class="popup-details-btn" data-msg-id="${esc(parsedMessage.id)}">View details &amp; GDC links</button>`;
        html += '</div>';
        return html;
    }

    /**
     * Start fade animation for a marker
     * @param {string} id - Marker ID
     * @param {L.Layer} marker - Leaflet marker
     */
    startFade(id, marker) {
        // Set initial opacity
        marker.setStyle({ opacity: 1, fillOpacity: 0.8 });

        // Calculate fade steps
        const startTime = Date.now();
        const duration = this.fadeDuration;

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Linear fade
            const opacity = 1 - progress;
            const fillOpacity = 0.8 * (1 - progress);

            try {
                marker.setStyle({
                    opacity: opacity,
                    fillOpacity: fillOpacity
                });
            } catch (error) {
                // Marker might have been removed
                return;
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Remove marker when fade is complete
                this.removeMarker(id);
            }
        };

        requestAnimationFrame(animate);
    }

    /**
     * Remove a marker from the map
     * @param {string} id - Marker ID
     */
    removeMarker(id) {
        const marker = this.markerMap.get(id);
        if (marker) {
            marker.remove();
            this.markerMap.delete(id);
            this.messageMap.delete(id);

            // Remove from markers array
            const index = this.markers.findIndex(m => m.id === id);
            if (index !== -1) {
                this.markers.splice(index, 1);
            }
        }
    }

    /**
     * Enforce max messages limit (FIFO)
     */
    enforceMaxMessages() {
        while (this.markers.length > this.maxMessages) {
            const oldest = this.markers[0];
            this.removeMarker(oldest.id);
        }
    }

    /**
     * Set topic filter
     * @param {Set} categories - Set of category names to show
     */
    setTopicFilter(categories) {
        this.activeFilters = new Set(categories);

        // Hide/show existing markers based on filter
        this.markers.forEach(markerData => {
            if (this.activeFilters.size === 0 || this.activeFilters.has(markerData.category)) {
                if (!this.map.hasLayer(markerData.marker)) {
                    markerData.marker.addTo(this.map);
                }
            } else {
                if (this.map.hasLayer(markerData.marker)) {
                    this.map.removeLayer(markerData.marker);
                }
            }
        });
    }

    /**
     * Clear all markers from the map
     */
    clearAllMarkers() {
        this.markers.forEach(markerData => {
            markerData.marker.remove();
        });
        this.markers = [];
        this.markerMap.clear();
        this.messageMap.clear();
    }

    /**
     * Get visible marker count
     * @returns {number} Count of visible markers
     */
    getVisibleMarkerCount() {
        return this.markers.filter(markerData => {
            return this.activeFilters.size === 0 || this.activeFilters.has(markerData.category);
        }).length;
    }

    /**
     * Get total marker count
     * @returns {number} Total marker count
     */
    getTotalMarkerCount() {
        return this.markers.length;
    }
}
