/**
 * MQTT Client
 * Handles connection to WIS2 global brokers via MQTT over WebSocket
 */
class MQTTClient {
    constructor() {
        this.client = null;
        this.connected = false;
        this.connecting = false;
        this.messageHandlers = [];
        this.statusHandlers = [];
        this.currentBroker = null;
        this.currentProtocol = null;
        this.subscribedTopics = [];
    }

    /**
     * Connect to a broker
     * @param {object} broker - Broker configuration
     * @param {string} protocol - Protocol to use (wss or mqtts)
     * @param {array} topics - Topics to subscribe to
     */
    connect(broker, protocol, topics) {
        if (this.connected || this.connecting) {
            console.warn('Already connected or connecting');
            return;
        }

        this.currentBroker = broker;
        this.currentProtocol = protocol;

        // Find the connection configuration for the specified protocol
        const connection = broker.connections.find(c => c.protocol === protocol);
        if (!connection) {
            this.emitStatus('error', `Protocol ${protocol} not supported by broker ${broker.name}`);
            return;
        }

        this.connecting = true;
        this.emitStatus('connecting', `Connecting to ${broker.name}...`);

        try {
            // Generate a unique client ID
            const clientId = 'wis2-mapper-' + Math.random().toString(16).substr(2, 8);

            // Build connection URL with credentials
            let url = connection.url;
            if (protocol === 'wss') {
                // For WebSocket, we need to use the path format
                url = `${connection.url}/mqtt`;
            }

            const options = {
                clientId: clientId,
                username: broker.username,
                password: broker.password,
                clean: true,
                reconnectPeriod: 5000,
                connectTimeout: 30000,
                keepalive: 60
            };

            console.log('Connecting to:', url, 'with options:', options);

            // Connect using MQTT.js
            this.client = mqtt.connect(url, options);

            // Set up event handlers
            this.client.on('connect', () => {
                console.log('Connected to broker');
                this.connected = true;
                this.connecting = false;
                this.emitStatus('connected', `Connected to ${broker.name}`);

                // Subscribe to topics
                this.subscribeToTopics(topics);
            });

            this.client.on('message', (topic, payload) => {
                this.handleMessage(topic, payload);
            });

            this.client.on('error', (error) => {
                console.error('MQTT error:', error);
                this.emitStatus('error', `Connection error: ${error.message}`);
                this.connecting = false;
            });

            this.client.on('close', () => {
                console.log('Connection closed');
                if (this.connected) {
                    this.connected = false;
                    this.emitStatus('disconnected', 'Connection closed');
                }
                this.connecting = false;
            });

            this.client.on('reconnect', () => {
                console.log('Attempting to reconnect...');
                // Only flip the UI to "Reconnecting..." if we know the link is actually down.
                // A 'reconnect' that fires while we're still happily connected (transient
                // library bookkeeping) shouldn't override a working state.
                if (!this.connected) {
                    this.emitStatus('connecting', 'Reconnecting...');
                }
            });

            this.client.on('offline', () => {
                console.log('Client offline');
                this.connected = false;
                this.emitStatus('disconnected', 'Client offline');
            });

        } catch (error) {
            console.error('Error connecting to broker:', error);
            this.emitStatus('error', `Failed to connect: ${error.message}`);
            this.connecting = false;
        }
    }

    /**
     * Subscribe to topics
     * @param {array} topics - Array of topic configurations
     */
    subscribeToTopics(topics) {
        if (!this.client || !this.connected) {
            console.warn('Cannot subscribe: not connected');
            return;
        }

        this.subscribedTopics = [];

        topics.forEach(topicConfig => {
            if (topicConfig.enabled) {
                this.client.subscribe(topicConfig.pattern, { qos: 0 }, (err) => {
                    if (err) {
                        console.error('Failed to subscribe to', topicConfig.pattern, err);
                    } else {
                        console.log('Subscribed to', topicConfig.pattern);
                        this.subscribedTopics.push(topicConfig.pattern);
                    }
                });
            }
        });
    }

    /**
     * Handle incoming message
     * @param {string} topic - Message topic
     * @param {Buffer} payload - Message payload
     */
    handleMessage(topic, payload) {
        try {
            const message = payload.toString();
            this.messageHandlers.forEach(handler => {
                try {
                    handler(topic, message);
                } catch (error) {
                    console.error('Error in message handler:', error);
                }
            });
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    /**
     * Register a message handler
     * @param {function} callback - Callback function(topic, message)
     */
    onMessage(callback) {
        this.messageHandlers.push(callback);
    }

    /**
     * Register a status change handler
     * @param {function} callback - Callback function(status, message)
     */
    onStatusChange(callback) {
        this.statusHandlers.push(callback);
    }

    /**
     * Emit status change
     * @param {string} status - Status (connected, connecting, disconnected, error)
     * @param {string} message - Status message
     */
    emitStatus(status, message) {
        this.statusHandlers.forEach(handler => {
            try {
                handler(status, message);
            } catch (error) {
                console.error('Error in status handler:', error);
            }
        });
    }

    /**
     * Disconnect from broker
     */
    disconnect() {
        if (this.client) {
            this.client.end(false, {}, () => {
                console.log('Disconnected from broker');
                this.connected = false;
                this.connecting = false;
                this.emitStatus('disconnected', 'Disconnected');
            });
            this.client = null;
        }
    }

    /**
     * Get connection status
     * @returns {object} Status object
     */
    getStatus() {
        return {
            connected: this.connected,
            connecting: this.connecting,
            broker: this.currentBroker,
            protocol: this.currentProtocol,
            topics: this.subscribedTopics
        };
    }

    /**
     * Check if connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.connected;
    }
}
