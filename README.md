# WIS2 Live Mapper

A live, browser-only viewer of the WMO Information System 2.0 (WIS2) notification stream. Connects to a WMO global broker over MQTT-over-WebSocket and plots incoming messages on a Leaflet map as they arrive.

![License](https://img.shields.io/badge/License-MIT-blue)

## Live Demo

[View Live Demo](https://jmaxmarno.github.io/wis2-live-mapper/)

## Quick Start

The app is entirely static — there's no backend — but it must be served over HTTP/HTTPS (it loads `config/default.json` via `fetch`, which won't work over `file://`).

```bash
git clone https://github.com/jmaxmarno/wis2-live-mapper.git
cd wis2-live-mapper

# Any static server works. Examples:
python -m http.server 8000
# or
npx http-server
```

Open `http://localhost:8000`. The app **auto-connects** to the default broker (Météo-France over WSS) and starts plotting incoming messages.

## What you see

- **Map** (Leaflet, CARTO Light by default). Each WIS2 message with valid geometry becomes a marker color-coded by category:
  - **Origin** (blue, `#3B82F6`) — data published by the source centre.
  - **Cache** (green, `#10B981`) — data mirrored by a global cache node.
  - **Monitor** (amber, `#F59E0B`) — broker heartbeats and processing alerts.
- **Statistics panel** (left, resizable). A live topic tree showing message counts at every prefix level. Click a row to expand/collapse children. Counts reflect what's currently in the buffer — they decrement as messages FIFO-evict.
  - `⋯` next to a count: opens the message-list modal for that topic prefix.
  - `⚠ N`: opens the same modal pre-filtered to messages without geometry (typically monitor alerts).
- **Marker fade**. After the configured fade duration, a marker transitions to a grey "ghost" style and stays on the map. Markers are only removed when the FIFO buffer hits its `maxMessages` cap. This means the panel and map agree: if a count is non-zero, you can drill into it.
- **Message detail modal**. Click any marker (or any "View details" button in the message-list modal) to see the full raw JSON payload, syntax-highlighted, with deep links to the same record on every configured WIS2 Global Discovery Catalogue (GDC) and a one-click "Copy JSON".

## Supported global brokers

WIS2 publishes four global brokers. Only those that expose a WebSocket endpoint can be reached from a browser (browsers can't open raw-TCP MQTTS connections). The Configure modal automatically hides protocols the browser can't speak.

| Provider | Country | Browser-reachable? |
|---|---|---|
| Météo-France | France | yes — WSS |
| INMET | Brazil | yes — WSS |
| NOAA NWS | United States | no — only MQTTS |
| CMA | China | no — only MQTTS |

All public brokers use credentials `everyone` / `everyone`.

## WIS2 Global Discovery Catalogues

Every payload-detail modal renders a deep link into each configured GDC, built from the message's `properties.metadata_id` URN. All three deployed GDCs (Canada/ECCC-MSC, Germany/DWD, China/CMA) run pygeoapi (OGC API – Records); the URN is the canonical record id, so links are pure URL templating. When `metadata_id` is empty, the link falls back to a centre-scoped search using the centre id parsed from the WIS2 topic.

| GDC | Base URL |
|---|---|
| Canada (ECCC-MSC) | `https://wis2-gdc.weather.gc.ca` |
| Germany (DWD)     | `https://wis2.dwd.de/gdc` |
| China (CMA)       | `https://gdc.wis.cma.cn/api` |

## File structure

```
wis2-live-mapper/
├── index.html              # Single-page shell, top bar, sidebar, modals
├── config/default.json     # Brokers, topics, GDCs, display settings
├── css/styles.css          # WMO-themed light UI + utility classes
└── js/
    ├── utils.js            # escapeHtml, wireModal helpers (load first)
    ├── config-manager.js   # fetch default.json + merge localStorage prefs
    ├── message-parser.js   # WIS2 notification → parsed message object
    ├── mqtt-client.js      # MQTT.js wrapper, connect/subscribe/disconnect
    ├── gdc-link.js         # build per-GDC URLs from metadata_id / centre
    ├── recent-messages.js  # FIFO buffer of parsed messages (single source of truth)
    ├── map-viewer.js       # Leaflet markers, fade-to-ghost animation
    ├── stats-panel.js      # Topic tree + counts + browse icons
    └── app.js              # WIS2LiveMapper coordinator
```

The map and stats panel are both **views over the `RecentMessages` buffer**: they react to `add`/`remove` events from the buffer rather than being driven directly. Eviction is FIFO at `settings.maxMessages` (no TTL); the marker fade is purely visual.

## Configuration

Edit `config/default.json` to change defaults or add brokers/GDCs/topics.

### Settings

```json
"settings": {
  "maxMessages": 1000,         // FIFO buffer cap (also drives map marker count)
  "markerFadeDuration": 30,    // seconds — when a marker turns grey
  "defaultZoom": 2,
  "defaultCenter": [0, 0],
  "markerSize": 8
}
```

User preferences (selected broker/protocol, max-markers, fade-duration) persist to `localStorage` under `wis2-mapper-preferences`. Stats-panel width persists separately.

### Adding a broker

```json
{
  "id": "my-broker",
  "name": "My WIS2 Broker",
  "connections": [
    { "protocol": "wss", "port": 443, "url": "wss://my-broker.example:443" }
  ],
  "username": "everyone",
  "password": "everyone"
}
```

Browser-reachable brokers must publish a `ws` or `wss` endpoint. The connection URL is appended with `/mqtt` for the WebSocket handshake.

### Topic colors

```json
{ "pattern": "origin/a/wis2/#", "name": "Origin", "color": "#3B82F6", "enabled": true }
```

The category in `parsedMessage.color` is derived from the first slash-segment of `pattern`, so changing `color` here propagates to markers, the topic tree's color dot, and the About modal.

### Adding a GDC

```json
{ "id": "my-gdc", "name": "My GDC", "baseUrl": "https://my-gdc.example/api" }
```

Every GDC in this list gets one deep-link button per message. Order in the array = order of the buttons.

## Browser requirements

- Modern Chromium / Firefox / Safari — anything that supports `fetch`, `Map`, `requestAnimationFrame`, and `WebSocket`.
- No bundler, no build step. Plain HTML + CSS + ES6+ classes loaded in dependency order.
- LocalStorage available for preference persistence.

## Deployment

Static hosting works anywhere — GitHub Pages, Netlify, Vercel, S3+CloudFront, plain nginx. Just serve the directory; no env vars or backend required.

For GitHub Pages: push to `main`, enable Pages from `Settings → Pages`, source `Deploy from branch / main / /`.

## Performance notes

- The whole pipeline is single-threaded. At very high message rates (>50/s sustained) the topic tree's debounced 100 ms re-render may show as the dominant frame. Easiest mitigation is to lower `maxMessages` or increase `markerFadeDuration` so fewer markers churn.
- Leaflet renders all markers as SVG circles by default. With many thousands buffered, switching to canvas (`L.canvas()`) is a future optimization not currently needed.

## Troubleshooting

- **"Failed to load config/default.json"** — you opened `index.html` over `file://`. Serve via HTTP (see Quick Start).
- **Status sticks on "Connecting..."** — broker may be temporarily unreachable. Check the JS console; MQTT.js will retry automatically every 5 s.
- **MQTTS protocol option missing** — expected. Browsers can't speak raw-TCP MQTTS; only WS/WSS connections are surfaced. NOAA and CMA only publish MQTTS endpoints, so they're effectively unreachable from a browser.

## License

MIT — see [LICENSE](LICENSE).

## References

- [WIS2 Cookbook](https://wmo-im.github.io/wis2-cookbook/cookbook/latest/wis2-cookbook-STABLE.html)
- [WIS2 Notification Message Schema](https://github.com/wmo-im/wis2-notification-message)
- [WMO WIS2 program](https://community.wmo.int/en/activity-areas/wis)
- [Leaflet](https://leafletjs.com/) · [MQTT.js](https://github.com/mqttjs/MQTT.js)
