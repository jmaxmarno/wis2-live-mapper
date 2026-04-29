/**
 * WIS2 Live Mapper Application
 * Main application controller
 */
class WIS2LiveMapper {
    constructor() {
        this.configManager = null;
        this.mqttClient = null;
        this.mapViewer = null;
        this.statsPanel = null;
        this.messageParser = null;

        this.messageCount = 0;
        this.messageRate = 0;
        this.lastMessageTime = Date.now();
        this.messageTimestamps = [];

        this.currentBroker = null;
        this.currentProtocol = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('Initializing WIS2 Live Mapper...');

        // Load configuration
        this.configManager = new ConfigManager();
        const config = await this.configManager.init();

        // Initialize components
        this.messageParser = new MessageParser();
        this.mqttClient = new MQTTClient();
        this.recentMessages = new RecentMessages(config.settings.maxMessages);
        this.mapViewer = new MapViewer('map', config);
        this.statsPanel = new StatsPanel('topic-tree', config.gdcs || []);

        // Initialize map
        this.mapViewer.init();

        // Map and stats panel are both views of the buffer
        this.mapViewer.bindBuffer(this.recentMessages);
        this.statsPanel.bindBuffer(this.recentMessages);

        // After every add/remove, refresh the on-screen counters
        this.recentMessages.onAdd(() => this.updateMapInfo());
        this.recentMessages.onRemove(() => this.updateMapInfo());

        // ⋯ and ⚠ in the topic tree open the message-list modal
        this.statsPanel.onBrowseRequest((topicPrefix, opts) => {
            this.showMessageList(topicPrefix, opts);
        });

        // Set up MQTT event handlers
        this.mqttClient.onMessage((topic, payload) => {
            this.handleMessage(topic, payload);
        });

        this.mqttClient.onStatusChange((status, message) => {
            this.updateConnectionStatus(status, message);
        });

        // Set up UI event handlers
        this.setupUIHandlers();

        // Make the stats panel draggable to resize
        this.setupResizableStatsPanel();

        // Wire the payload-detail modal (opens when a popup "View details" button is clicked)
        this.setupPayloadModal();

        // Wire the message-list modal (opens via ⋯ / ⚠ in the topic tree)
        this.setupMessageListModal();

        // Populate configuration UI
        this.populateConfigUI(config);

        // Start message rate calculation
        this.startMessageRateCalculation();

        console.log('WIS2 Live Mapper initialized');

        // Auto-connect using default config so data starts flowing immediately
        this.autoConnect();
    }

    /**
     * Connect using the default config values without requiring user interaction.
     * Falls back to the first browser-compatible protocol if the configured default
     * is mqtts (browsers can only do ws/wss).
     */
    autoConnect() {
        const config = this.configManager.config;
        const broker = this.configManager.getBroker(config.defaultBroker);
        if (!broker) {
            console.warn('Auto-connect skipped: default broker not found in config');
            return;
        }

        const wsConnections = broker.connections.filter(c => c.protocol === 'ws' || c.protocol === 'wss');
        let protocol = config.defaultProtocol;
        if (!wsConnections.find(c => c.protocol === protocol)) {
            protocol = wsConnections[0]?.protocol;
        }
        if (!protocol) {
            console.warn('Auto-connect skipped: default broker has no browser-compatible protocol');
            return;
        }

        const topics = config.topics.filter(t => t.enabled);
        if (topics.length === 0) {
            console.warn('Auto-connect skipped: no topics enabled in default config');
            return;
        }

        // Reflect chosen protocol in the modal radios so Configure stays in sync
        const radio = document.getElementById(`protocol-${protocol}`);
        if (radio) radio.checked = true;

        this.currentBroker = broker;
        this.currentProtocol = protocol;
        this.mqttClient.connect(broker, protocol, topics);
    }

    /**
     * Set up the payload-detail modal: clicks on popup details buttons,
     * close, copy-to-clipboard, click-outside-to-close.
     */
    setupPayloadModal() {
        const modal = document.getElementById('payload-modal');
        const closeBtn = document.getElementById('close-payload-btn');
        const copyBtn = document.getElementById('payload-copy-btn');

        if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'payload-modal') modal.classList.remove('active');
            });
        }
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                if (!this.currentPayload) return;
                const text = JSON.stringify(this.currentPayload, null, 2);
                try {
                    await navigator.clipboard.writeText(text);
                    const orig = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = orig; }, 1500);
                } catch (err) {
                    console.error('Copy failed:', err);
                }
            });
        }

        // Event delegation: open the modal when any popup-details button is clicked
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.popup-details-btn');
            if (!btn) return;
            e.preventDefault();
            const id = btn.dataset.msgId;
            const msg = this.recentMessages && this.recentMessages.get(id);
            if (msg) this.showPayloadModal(msg);
        });
    }

    showPayloadModal(parsedMessage) {
        const modal = document.getElementById('payload-modal');
        const topicEl = document.getElementById('payload-topic');
        const linksEl = document.getElementById('payload-gdc-links');
        const jsonEl = document.getElementById('payload-json');
        if (!modal || !jsonEl) return;

        this.currentPayload = parsedMessage.raw || parsedMessage;

        if (topicEl) topicEl.textContent = parsedMessage.topic || '';

        // GDC links — one per configured GDC (record link if metadata_id present, else centre search)
        const gdcs = (this.configManager && this.configManager.config && this.configManager.config.gdcs) || [];
        const linkSet = (typeof GDCLinks !== 'undefined') ? GDCLinks.buildAllLinks(parsedMessage, gdcs) : { kind: 'none', links: [] };
        linksEl.innerHTML = this.renderGdcLinks(linkSet);

        // Pretty-printed, syntax-highlighted JSON
        jsonEl.innerHTML = this.formatJsonHtml(this.currentPayload);

        modal.classList.add('active');
    }

    renderGdcLinks(linkSet) {
        const escAttr = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escText = (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        if (!linkSet.links.length) {
            return '<div class="gdc-section-empty">No GDC link available — message has no metadata_id and no parseable centre id.</div>';
        }

        let label;
        if (linkSet.kind === 'record') {
            label = 'Discovery-metadata record:';
        } else {
            label = `No metadata_id — search centre <code>${escText(linkSet.centre)}</code> on:`;
        }

        const buttons = linkSet.links.map(l =>
            `<a class="gdc-link" href="${escAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escText(l.name)} <span aria-hidden="true">↗</span></a>`
        ).join('');

        return `<div class="gdc-section-label">${label}</div><div class="gdc-link-list">${buttons}</div>`;
    }

    formatJsonHtml(obj) {
        let json;
        try {
            json = JSON.stringify(obj, null, 2);
        } catch (e) {
            return '<span class="json-null">[unserializable payload]</span>';
        }
        if (json === undefined) json = 'undefined';

        // HTML-escape first, then add syntax-color spans
        const escaped = json
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        return escaped.replace(
            /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
            (match) => {
                let cls;
                if (/^"/.test(match)) {
                    cls = /:\s*$/.test(match) ? 'json-key' : 'json-string';
                } else if (/^(true|false)$/.test(match)) {
                    cls = 'json-boolean';
                } else if (match === 'null') {
                    cls = 'json-null';
                } else {
                    cls = 'json-number';
                }
                return `<span class="${cls}">${match}</span>`;
            }
        );
    }

    /**
     * Set up UI event handlers
     */
    setupUIHandlers() {
        // Config button
        document.getElementById('config-btn').addEventListener('click', () => {
            this.showConfigModal();
        });

        // Close config button
        document.getElementById('close-config-btn').addEventListener('click', () => {
            this.hideConfigModal();
        });

        // Connect button
        document.getElementById('connect-btn').addEventListener('click', () => {
            this.connect();
        });

        // Disconnect button
        document.getElementById('disconnect-btn').addEventListener('click', () => {
            this.disconnect();
        });

        // Clear map button
        document.getElementById('clear-map-btn').addEventListener('click', () => {
            this.clearMap();
        });

        // Close modal on outside click
        document.getElementById('config-modal').addEventListener('click', (e) => {
            if (e.target.id === 'config-modal') {
                this.hideConfigModal();
            }
        });

        // Broker selection change
        document.getElementById('broker-select').addEventListener('change', (e) => {
            this.updateProtocolOptions(e.target.value);
        });

        // Dirty tracking: any change to a config control marks the form as dirty
        // and prompts the user to click Connect. Cleared after a successful connect().
        const configForm = document.getElementById('config-form');
        if (configForm) {
            configForm.addEventListener('change', () => this.markConfigDirty(true));
            configForm.addEventListener('input', (e) => {
                if (e.target && (e.target.id === 'max-messages' || e.target.id === 'fade-duration')) {
                    this.markConfigDirty(true);
                }
            });
        }
    }

    /**
     * Show / hide the "settings changed — click Connect" indicator and pulse the
     * Connect button. Called with `true` whenever a config control is touched
     * and `false` after a connect() kickoff.
     */
    markConfigDirty(dirty) {
        this.configDirty = !!dirty;
        const note = document.getElementById('config-dirty-note');
        const connectBtn = document.getElementById('connect-btn');
        if (note) note.classList.toggle('hidden', !dirty);
        if (connectBtn) connectBtn.classList.toggle('btn-attention', !!dirty);
    }

    /**
     * Populate configuration UI
     * @param {object} config - Configuration object
     */
    populateConfigUI(config) {
        // Populate broker dropdown
        const brokerSelect = document.getElementById('broker-select');
        config.brokers.forEach(broker => {
            const option = document.createElement('option');
            option.value = broker.id;
            option.textContent = broker.name;
            if (broker.id === config.defaultBroker) {
                option.selected = true;
            }
            brokerSelect.appendChild(option);
        });

        // Populate topic checkboxes
        const topicCheckboxes = document.getElementById('topic-checkboxes');
        config.topics.forEach(topic => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `topic-${topic.name}`;
            checkbox.value = topic.pattern;
            checkbox.checked = topic.enabled;
            checkbox.className = 'rounded';

            const label = document.createElement('label');
            label.htmlFor = `topic-${topic.name}`;
            label.className = 'flex items-center gap-2 cursor-pointer';

            const colorIndicator = document.createElement('span');
            colorIndicator.className = 'topic-color-indicator';
            colorIndicator.style.backgroundColor = topic.color;

            label.appendChild(colorIndicator);
            label.appendChild(document.createTextNode(`${topic.pattern} (${topic.name})`));

            div.appendChild(checkbox);
            div.appendChild(label);
            topicCheckboxes.appendChild(div);
        });

        // Set default values
        document.getElementById('max-messages').value = config.settings.maxMessages;
        document.getElementById('fade-duration').value = config.settings.markerFadeDuration;

        // Update protocol options for default broker
        this.updateProtocolOptions(config.defaultBroker);
    }

    /**
     * Update protocol options based on selected broker
     * @param {string} brokerId - Broker ID
     */
    updateProtocolOptions(brokerId) {
        const broker = this.configManager.getBroker(brokerId);
        if (!broker) return;

        const protocolOptions = document.getElementById('protocol-options');
        protocolOptions.innerHTML = '';

        // Browsers can't speak raw-TCP MQTTS — only WS/WSS work in-browser.
        const supported = broker.connections.filter(c => c.protocol === 'ws' || c.protocol === 'wss');
        const unsupported = broker.connections.filter(c => c.protocol !== 'ws' && c.protocol !== 'wss');

        if (supported.length === 0) {
            const note = document.createElement('div');
            note.className = 'text-sm text-yellow-400';
            note.textContent = 'This broker does not advertise a WebSocket endpoint, so it cannot be reached from a browser.';
            protocolOptions.appendChild(note);
            return;
        }

        let firstChecked = false;
        supported.forEach((conn) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'protocol';
            radio.id = `protocol-${conn.protocol}`;
            radio.value = conn.protocol;
            if (!firstChecked || conn.protocol === this.configManager.config.defaultProtocol) {
                radio.checked = true;
                firstChecked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = `protocol-${conn.protocol}`;
            label.textContent = conn.protocol.toUpperCase() + (conn.protocol === 'wss' ? ' (Recommended)' : '');
            label.className = 'cursor-pointer';

            div.appendChild(radio);
            div.appendChild(label);
            protocolOptions.appendChild(div);
        });

        if (unsupported.length > 0) {
            const note = document.createElement('div');
            note.className = 'text-xs text-gray-400 mt-2';
            note.textContent = `Hidden: ${unsupported.map(c => c.protocol.toUpperCase()).join(', ')} — browsers can only open WebSocket connections.`;
            protocolOptions.appendChild(note);
        }
    }

    /**
     * Wire up the drag handle that resizes the stats panel.
     */
    setupResizableStatsPanel() {
        const aside = document.getElementById('stats-panel');
        const handle = document.getElementById('stats-panel-resize-handle');
        if (!aside || !handle) return;

        const MIN_WIDTH = 200;
        const MAX_WIDTH = 800;

        // Restore previously saved width
        try {
            const saved = parseInt(localStorage.getItem('wis2-mapper-stats-width'), 10);
            if (!isNaN(saved) && saved >= MIN_WIDTH && saved <= MAX_WIDTH) {
                aside.style.width = saved + 'px';
            }
        } catch (e) {}

        let isDragging = false;
        let pendingFrame = null;

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const rect = aside.getBoundingClientRect();
            const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, e.clientX - rect.left));
            aside.style.width = newWidth + 'px';
            if (!pendingFrame) {
                pendingFrame = requestAnimationFrame(() => {
                    pendingFrame = null;
                    if (this.mapViewer && this.mapViewer.map) {
                        this.mapViewer.map.invalidateSize();
                    }
                });
            }
        };

        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            handle.classList.remove('dragging');
            document.body.classList.remove('resizing-stats-panel');
            try {
                localStorage.setItem('wis2-mapper-stats-width', parseInt(aside.style.width, 10));
            } catch (e) {}
            if (this.mapViewer && this.mapViewer.map) {
                this.mapViewer.map.invalidateSize();
            }
        };

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            handle.classList.add('dragging');
            document.body.classList.add('resizing-stats-panel');
            e.preventDefault();
        });
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Show configuration modal
     */
    showConfigModal() {
        document.getElementById('config-modal').classList.add('active');
    }

    /**
     * Hide configuration modal
     */
    hideConfigModal() {
        document.getElementById('config-modal').classList.remove('active');
    }

    /**
     * Connect to broker
     */
    connect() {
        // Get selected broker
        const brokerId = document.getElementById('broker-select').value;
        const broker = this.configManager.getBroker(brokerId);

        if (!broker) {
            alert('Please select a broker');
            return;
        }

        // Get selected protocol
        const protocolRadio = document.querySelector('input[name="protocol"]:checked');
        const protocol = protocolRadio ? protocolRadio.value : 'wss';

        // Get enabled topics
        const topicCheckboxes = document.querySelectorAll('#topic-checkboxes input[type="checkbox"]');
        const topics = [];
        topicCheckboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const topicConfig = this.configManager.config.topics.find(t => t.pattern === checkbox.value);
                if (topicConfig) {
                    topics.push(topicConfig);
                }
            }
        });

        if (topics.length === 0) {
            alert('Please select at least one topic to subscribe');
            return;
        }

        // Update settings
        const maxMessages = parseInt(document.getElementById('max-messages').value);
        const fadeDuration = parseInt(document.getElementById('fade-duration').value);

        this.configManager.config.settings.maxMessages = maxMessages;
        this.configManager.config.settings.markerFadeDuration = fadeDuration;
        if (this.recentMessages) this.recentMessages.setMaxSize(maxMessages);
        this.mapViewer.fadeDuration = fadeDuration * 1000;

        // Save preferences
        this.configManager.saveUserPreferences({
            selectedBroker: brokerId,
            selectedProtocol: protocol,
            settings: {
                maxMessages: maxMessages,
                markerFadeDuration: fadeDuration
            }
        });

        // If we're already connected/connecting, drop the existing session so
        // the reconnect picks up the new broker / protocol / topic / setting selection.
        if (this.mqttClient.isConnected() || this.mqttClient.connecting) {
            this.mqttClient.disconnect();
        }

        // Connect with the (possibly updated) selection.
        this.currentBroker = broker;
        this.currentProtocol = protocol;
        this.mqttClient.connect(broker, protocol, topics);

        // Form is now in sync with the live connection.
        this.markConfigDirty(false);

        // Hide modal
        this.hideConfigModal();
    }

    /**
     * Disconnect from broker
     */
    disconnect() {
        this.mqttClient.disconnect();
        this.hideConfigModal();
    }

    /**
     * Handle incoming message
     * @param {string} topic - Message topic
     * @param {string} payload - Message payload
     */
    handleMessage(topic, payload) {
        const parsedMessage = this.messageParser.parse(topic, payload);
        if (!parsedMessage) return;

        // Self-correct status display: if data is flowing, we're connected.
        if (this.lastShownStatus !== 'connected' && this.currentBroker) {
            this.updateConnectionStatus('connected', `Connected to ${this.currentBroker.name}`);
        }

        // Lifetime counter (separate from buffer state shown in topic tree).
        this.messageCount++;
        this.messageTimestamps.push(Date.now());

        // Single source of truth — map and stats panel update via buffer events.
        this.recentMessages.add(parsedMessage);

        this.updateMessageCounters();
    }

    /**
     * Update connection status display
     * @param {string} status - Status (connected, connecting, disconnected, error)
     * @param {string} message - Status message
     */
    updateConnectionStatus(status, message) {
        const statusIndicator = document.querySelector('.status-indicator');
        const statusText = document.getElementById('status-text');

        statusIndicator.className = 'status-indicator ' + status;
        statusText.textContent = message;
        this.lastShownStatus = status;

        // Update connection info in modal
        if (status === 'connected') {
            const connectionInfo = document.getElementById('connection-info');
            const connectionDetails = document.getElementById('connection-details');

            connectionDetails.innerHTML = `
                <div>Broker: ${this.currentBroker.name}</div>
                <div>Protocol: ${this.currentProtocol.toUpperCase()}</div>
                <div>Topics: ${this.mqttClient.subscribedTopics.length}</div>
            `;
            connectionInfo.classList.remove('hidden');
        }
    }

    /**
     * Update message counters in UI
     */
    updateMessageCounters() {
        document.getElementById('total-messages').textContent = this.messageCount.toLocaleString();
    }

    /**
     * Update map info display
     */
    updateMapInfo() {
        const buffered = this.recentMessages ? this.recentMessages.size() : 0;
        const onMap = this.mapViewer ? this.mapViewer.getMarkerCount() : 0;
        document.getElementById('map-message-count').textContent = this.messageCount.toLocaleString();
        document.getElementById('map-shown-count').textContent = onMap.toLocaleString();
        document.getElementById('visible-markers').textContent = buffered.toLocaleString();
    }

    /**
     * Start message rate calculation
     */
    startMessageRateCalculation() {
        setInterval(() => {
            // Calculate messages per second over last 5 seconds
            const now = Date.now();
            const fiveSecondsAgo = now - 5000;

            // Remove old timestamps
            this.messageTimestamps = this.messageTimestamps.filter(ts => ts > fiveSecondsAgo);

            // Calculate rate
            const rate = this.messageTimestamps.length / 5;
            this.messageRate = rate;

            // Update display
            document.getElementById('messages-per-second').textContent = rate.toFixed(1);
        }, 1000);
    }

    /**
     * Clear map
     */
    clearMap() {
        if (!confirm('Clear all markers, message counters, and topic statistics?')) return;

        // Clearing the buffer cascades remove events into the map and stats panel.
        if (this.recentMessages) this.recentMessages.clear();
        this.mapViewer.clearAllMarkers(); // belt-and-suspenders
        this.statsPanel.clear();

        this.messageCount = 0;
        this.messageTimestamps = [];
        this.messageRate = 0;

        this.updateMessageCounters();
        this.updateMapInfo();
        document.getElementById('messages-per-second').textContent = '0.0';
    }

    /**
     * Wire the message-list modal: close, click-outside, list rendering.
     */
    setupMessageListModal() {
        const modal = document.getElementById('message-list-modal');
        const closeBtn = document.getElementById('close-message-list-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'message-list-modal') modal.classList.remove('active');
            });
        }
    }

    showMessageList(topicPrefix, opts = {}) {
        const { noGeoOnly = false } = opts;
        const modal = document.getElementById('message-list-modal');
        const heading = document.getElementById('message-list-heading');
        const topicEl = document.getElementById('message-list-topic');
        const countEl = document.getElementById('message-list-count');
        const listEl = document.getElementById('message-list');
        if (!modal || !listEl) return;

        const all = this.recentMessages.findByTopicPrefix(topicPrefix);
        const matching = noGeoOnly ? all.filter(m => !m.hasGeometry) : all;

        if (heading) heading.textContent = noGeoOnly ? 'Buffered messages without geometry' : 'Buffered messages';
        if (topicEl) topicEl.textContent = topicPrefix;
        if (countEl) {
            countEl.textContent = `${matching.length.toLocaleString()} buffered (FIFO cap: ${this.recentMessages.maxSize.toLocaleString()})`;
        }

        if (matching.length === 0) {
            listEl.innerHTML = '<div class="text-muted text-sm">No messages currently buffered for this topic.</div>';
        } else {
            const esc = (s) => this.escapeHtml(s);
            listEl.innerHTML = matching.slice(0, 200).map(m => {
                const flag = m.hasGeometry
                    ? '<span class="msg-flag msg-flag-geo">geo</span>'
                    : '<span class="msg-flag msg-flag-nogeo">no-geo</span>';
                return `
                    <div class="message-list-item">
                        <div class="flex items-center gap-2 mb-1">
                            ${flag}
                            <span class="text-xs text-muted">${esc(new Date(m.pubtime || Date.now()).toLocaleTimeString())}</span>
                        </div>
                        <div class="text-xs text-muted break-all mb-1">${esc(m.topic)}</div>
                        ${m.dataId ? `<div class="text-xs break-all mb-2"><span class="text-muted">data_id:</span> ${esc(m.dataId)}</div>` : ''}
                        <button class="popup-details-btn" data-msg-id="${esc(m.id)}">View details &amp; GDC links</button>
                    </div>
                `;
            }).join('');
        }

        modal.classList.add('active');
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
}

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new WIS2LiveMapper();
    app.init().catch(error => {
        console.error('Failed to initialize application:', error);
        alert('Failed to initialize application. Please check the console for details.');
    });
});
