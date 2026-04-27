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
        this.mapViewer = new MapViewer('map', config);
        this.statsPanel = new StatsPanel('topic-tree');

        // Initialize map
        this.mapViewer.init();

        // Set up MQTT event handlers
        this.mqttClient.onMessage((topic, payload) => {
            this.handleMessage(topic, payload);
        });

        this.mqttClient.onStatusChange((status, message) => {
            this.updateConnectionStatus(status, message);
        });

        // Set up stats panel filter handler
        this.statsPanel.onFilterChange((filters) => {
            this.mapViewer.setTopicFilter(filters);
            this.updateMapInfo();
        });

        // Set up UI event handlers
        this.setupUIHandlers();

        // Populate configuration UI
        this.populateConfigUI(config);

        // Start message rate calculation
        this.startMessageRateCalculation();

        console.log('WIS2 Live Mapper initialized');
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

        broker.connections.forEach((conn, index) => {
            const div = document.createElement('div');
            div.className = 'flex items-center gap-2';

            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'protocol';
            radio.id = `protocol-${conn.protocol}`;
            radio.value = conn.protocol;
            if (index === 0 || conn.protocol === this.configManager.config.defaultProtocol) {
                radio.checked = true;
            }

            const label = document.createElement('label');
            label.htmlFor = `protocol-${conn.protocol}`;
            label.textContent = conn.protocol.toUpperCase() + (conn.protocol === 'wss' ? ' (Recommended)' : '');
            label.className = 'cursor-pointer';

            div.appendChild(radio);
            div.appendChild(label);
            protocolOptions.appendChild(div);
        });
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
        this.mapViewer.maxMessages = maxMessages;
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

        // Connect
        this.currentBroker = broker;
        this.currentProtocol = protocol;
        this.mqttClient.connect(broker, protocol, topics);

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
        // Parse message
        const parsedMessage = this.messageParser.parse(topic, payload);

        if (!parsedMessage) {
            return;
        }

        // Increment message count
        this.messageCount++;
        this.messageTimestamps.push(Date.now());

        // Update statistics panel
        this.statsPanel.updateTopic(topic, parsedMessage);

        // Add to map
        this.mapViewer.addMessage(parsedMessage);

        // Update UI
        this.updateMessageCounters();
        this.updateMapInfo();
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
        document.getElementById('map-message-count').textContent = this.messageCount.toLocaleString();
        document.getElementById('map-shown-count').textContent = this.mapViewer.getTotalMarkerCount().toLocaleString();
        document.getElementById('visible-markers').textContent = this.mapViewer.getVisibleMarkerCount().toLocaleString();
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
        if (confirm('Clear all markers from the map?')) {
            this.mapViewer.clearAllMarkers();
            this.updateMapInfo();
        }
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
