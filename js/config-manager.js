/**
 * Configuration Manager
 * Loads and manages application configuration
 */
class ConfigManager {
    constructor() {
        this.config = null;
        this.userPreferences = null;
    }

    async init() {
        // Load default configuration
        await this.loadDefaultConfig();

        // Load user preferences from localStorage
        this.loadUserPreferences();

        return this.config;
    }

    async loadDefaultConfig() {
        try {
            const response = await fetch('config/default.json');
            if (!response.ok) {
                throw new Error('Failed to load configuration');
            }
            this.config = await response.json();
        } catch (error) {
            console.error('Error loading configuration:', error);
            // Fallback to minimal config
            this.config = this.getFallbackConfig();
        }
    }

    loadUserPreferences() {
        const stored = localStorage.getItem('wis2-mapper-preferences');
        if (stored) {
            try {
                this.userPreferences = JSON.parse(stored);
                // Merge user preferences with default config
                this.mergePreferences();
            } catch (error) {
                console.error('Error loading user preferences:', error);
            }
        }
    }

    mergePreferences() {
        if (!this.userPreferences) return;

        // Merge settings
        if (this.userPreferences.settings) {
            this.config.settings = {
                ...this.config.settings,
                ...this.userPreferences.settings
            };
        }

        // Apply selected broker and protocol
        if (this.userPreferences.selectedBroker) {
            this.config.defaultBroker = this.userPreferences.selectedBroker;
        }
        if (this.userPreferences.selectedProtocol) {
            this.config.defaultProtocol = this.userPreferences.selectedProtocol;
        }

        // Apply topic filters
        if (this.userPreferences.activeTopicFilters) {
            this.config.activeTopicFilters = this.userPreferences.activeTopicFilters;
        }
    }

    saveUserPreferences(preferences) {
        this.userPreferences = {
            ...this.userPreferences,
            ...preferences
        };

        try {
            localStorage.setItem('wis2-mapper-preferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.error('Error saving user preferences:', error);
        }
    }

    getBroker(brokerId) {
        return this.config.brokers.find(b => b.id === brokerId);
    }

    getDefaultBroker() {
        return this.getBroker(this.config.defaultBroker);
    }

    getTopics() {
        return this.config.topics;
    }

    getSettings() {
        return this.config.settings;
    }

    getFallbackConfig() {
        return {
            brokers: [
                {
                    id: "fr-meteofrance-global-broker",
                    name: "Météo-France (France)",
                    host: "globalbroker.meteo.fr",
                    connections: [
                        {
                            protocol: "wss",
                            port: 443,
                            url: "wss://globalbroker.meteo.fr:443"
                        }
                    ],
                    username: "everyone",
                    password: "everyone"
                }
            ],
            defaultBroker: "fr-meteofrance-global-broker",
            defaultProtocol: "wss",
            topics: [
                {
                    pattern: "origin/a/wis2/#",
                    name: "Origin",
                    color: "#3B82F6",
                    enabled: true
                },
                {
                    pattern: "cache/a/wis2/#",
                    name: "Cache",
                    color: "#10B981",
                    enabled: true
                },
                {
                    pattern: "monitor/a/wis2/#",
                    name: "Monitor",
                    color: "#F59E0B",
                    enabled: true
                }
            ],
            settings: {
                maxMessages: 1000,
                markerFadeDuration: 30,
                defaultZoom: 2,
                defaultCenter: [0, 0],
                updateInterval: 100,
                markerSize: 8
            }
        };
    }
}
