/**
 * Configuration Manager
 * Loads default config from config/default.json and merges in localStorage prefs.
 */
class ConfigManager {
    constructor() {
        this.config = null;
        this.userPreferences = null;
    }

    async init() {
        await this.loadDefaultConfig();
        this.loadUserPreferences();
        return this.config;
    }

    async loadDefaultConfig() {
        const response = await fetch('config/default.json');
        if (!response.ok) {
            throw new Error(
                `Failed to load config/default.json (HTTP ${response.status}). ` +
                `The app must be served over HTTP/HTTPS — opening index.html via file:// will not work.`
            );
        }
        this.config = await response.json();
    }

    loadUserPreferences() {
        const stored = localStorage.getItem('wis2-mapper-preferences');
        if (!stored) return;
        try {
            this.userPreferences = JSON.parse(stored);
            this.mergePreferences();
        } catch (error) {
            console.error('Error loading user preferences:', error);
        }
    }

    mergePreferences() {
        if (!this.userPreferences) return;
        if (this.userPreferences.settings) {
            this.config.settings = { ...this.config.settings, ...this.userPreferences.settings };
        }
        if (this.userPreferences.selectedBroker)   this.config.defaultBroker   = this.userPreferences.selectedBroker;
        if (this.userPreferences.selectedProtocol) this.config.defaultProtocol = this.userPreferences.selectedProtocol;
    }

    saveUserPreferences(preferences) {
        this.userPreferences = { ...this.userPreferences, ...preferences };
        try {
            localStorage.setItem('wis2-mapper-preferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.error('Error saving user preferences:', error);
        }
    }

    getBroker(brokerId) {
        return this.config.brokers.find(b => b.id === brokerId);
    }
}
