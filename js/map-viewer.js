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
        return L.circleMarker([lat, lon], {
            radius: this.config.settings.markerSize,
            fillColor: parsedMessage.color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8,
            className: 'marker-fade'
        });
    }

    createPolygonMarker(parsedMessage) {
        const coordinates = parsedMessage.geometry.type === 'Polygon'
            ? parsedMessage.geometry.coordinates[0].map(c => [c[1], c[0]])
            : parsedMessage.geometry.coordinates[0][0].map(c => [c[1], c[0]]);

        // Border-only: keep fill enabled (so the polygon's interior remains a click
        // target for hit-testing) but fillOpacity:0 so it doesn't obscure the basemap
        // or any markers underneath.
        return L.polygon(coordinates, {
            fillColor: parsedMessage.color,
            color: parsedMessage.color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0,
            className: 'marker-fade'
        });
    }

    createLineMarker(parsedMessage) {
        const coordinates = parsedMessage.geometry.type === 'LineString'
            ? parsedMessage.geometry.coordinates.map(c => [c[1], c[0]])
            : parsedMessage.geometry.coordinates[0].map(c => [c[1], c[0]]);
        return L.polyline(coordinates, {
            color: parsedMessage.color,
            weight: 3,
            opacity: 0.8,
            className: 'marker-fade'
        });
    }

    /**
     * Animate a marker from its full color to a grey "ghost" style over
     * fadeDuration. The marker is NOT removed when the fade completes —
     * it stays buffered until FIFO eviction.
     *
     * Polygons start with fillOpacity:0 (border-only) — we preserve that by
     * interpolating from each marker's initial fillOpacity, so border-only
     * shapes stay border-only throughout fade and ghost.
     */
    startFade(id, marker) {
        const startTime = Date.now();
        const duration = this.fadeDuration;
        const initialFillOpacity = marker.options.fillOpacity ?? 0;
        const ghostFillOpacity = initialFillOpacity > 0 ? 0.35 : 0;

        const animate = () => {
            const entry = this.markers.get(id);
            if (!entry) return; // marker removed
            const progress = Math.min((Date.now() - startTime) / duration, 1);

            try {
                if (progress >= 1) {
                    marker.setStyle({
                        fillColor: '#9ca3af',
                        color: '#6b7280',
                        weight: 1,
                        opacity: 0.55,
                        fillOpacity: ghostFillOpacity
                    });
                    entry.fadeRaf = null;
                    return;
                }
                marker.setStyle({
                    opacity: 1 - 0.45 * progress,
                    fillOpacity: initialFillOpacity - (initialFillOpacity - ghostFillOpacity) * progress
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

    /**
     * Hit-test all current markers against a click latlng. Returns an array
     * of message ids whose shape contains (or comes within `tolerancePx` of)
     * the click. Used to drive the multi-hit picker.
     */
    findMessageIdsAt(latlng, tolerancePx = 4) {
        if (!this.map || this.markers.size === 0) return [];
        const clickPt = this.map.latLngToContainerPoint(latlng);
        const hits = [];
        for (const [id, entry] of this.markers) {
            if (this._hitTest(entry.marker, latlng, clickPt, tolerancePx)) hits.push(id);
        }
        return hits;
    }

    _hitTest(layer, latlng, clickPt, tolerancePx) {
        if (layer instanceof L.CircleMarker) {
            const c = this.map.latLngToContainerPoint(layer.getLatLng());
            return clickPt.distanceTo(c) <= layer.getRadius() + tolerancePx;
        }
        if (layer instanceof L.Polygon) {
            if (!layer.getBounds().contains(latlng)) return false;
            return MapViewer._pointInPolygon(latlng, layer);
        }
        if (layer instanceof L.Polyline) {
            const points = layer.getLatLngs().map(ll => this.map.latLngToContainerPoint(ll));
            for (let i = 0; i < points.length - 1; i++) {
                if (MapViewer._distToSegment(clickPt, points[i], points[i + 1]) <= tolerancePx) return true;
            }
            return false;
        }
        return false;
    }

    /** Ray-casting point-in-polygon over the outer ring (lat/lng space). */
    static _pointInPolygon(latlng, polygon) {
        const rings = polygon.getLatLngs();
        if (!rings.length) return false;
        // L.Polygon.getLatLngs() returns either [ring] (simple) or [outer, hole, ...]
        // — either way rings[0] is the outer ring as an array of LatLng.
        const outer = Array.isArray(rings[0]) ? rings[0] : rings;
        let inside = false;
        for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
            const xi = outer[i].lng, yi = outer[i].lat;
            const xj = outer[j].lng, yj = outer[j].lat;
            const intersect = ((yi > latlng.lat) !== (yj > latlng.lat))
                && (latlng.lng < ((xj - xi) * (latlng.lat - yi)) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    static _distToSegment(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }
}
