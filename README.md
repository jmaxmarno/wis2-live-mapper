# WIS2 Live Mapper

A live, heads-up display of incoming core WIS2 (WMO Information System 2.0) data. This application connects to WMO global brokers via MQTT and visualizes real-time meteorological data notifications on an interactive map.

![WIS2 Live Mapper](https://img.shields.io/badge/Status-Active-success)
![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Real-time MQTT Connection**: Connect to any of the 4 official WMO WIS2 global brokers
- **Interactive Map**: Visualize data points, polygons, and lines on an interactive Leaflet map
- **Ephemeral Markers**: Markers fade out over time to avoid clutter
- **Topic Hierarchy**: Browse and filter messages by WIS2 topic structure
- **Multiple Base Maps**: Choose from OpenTopoMap, OpenStreetMap, Satellite, or Minimal styles
- **Color-Coded Categories**:
  - 🔵 **Blue**: Origin data (`origin/a/wis2/#`)
  - 🟢 **Green**: Cache data (`cache/a/wis2/#`)
  - 🟠 **Orange**: Monitor data (`monitor/a/wis2/#`)
- **Performance Optimized**: Configurable message limits and fade durations
- **Browser-Based**: No backend required - runs entirely in your browser

## Live Demo

🌐 **[View Live Demo](https://jmaxmarno.github.io/wis2-live-mapper/)**

## Quick Start

1. **Open the Application**
   - Visit the live demo link above, or
   - Clone this repository and open `index.html` in a modern web browser

2. **Configure Connection**
   - Click the "Configure" button in the top right
   - Select a global broker (default: Météo-France)
   - Choose connection protocol (WSS recommended)
   - Select topics to subscribe (all enabled by default)
   - Click "Connect"

3. **Explore Data**
   - Watch as markers appear on the map in real-time
   - Click markers to view message details
   - Browse the statistics panel to see message counts by topic
   - Click on top-level topics (origin/cache/monitor) to filter the map

## Supported Global Brokers

The application comes pre-configured with all 4 official WMO WIS2 global brokers:

| Provider | Country | Protocols |
|----------|---------|-----------|
| **Météo-France** | France | WSS, MQTTS |
| **NOAA NWS** | United States | MQTTS |
| **INMET** | Brazil | WSS, MQTTS |
| **CMA** | China | MQTTS |

All brokers use the credentials: `everyone` / `everyone`

## WIS2 Topics

The application subscribes to three main topic categories:

- **`origin/a/wis2/#`**: Original data from data producers
- **`cache/a/wis2/#`**: Cached data from global caches
- **`monitor/a/wis2/#`**: Monitoring and heartbeat messages

## Configuration Options

### Display Settings

- **Max Markers**: Maximum number of markers to display (default: 1000)
- **Fade Duration**: Time in seconds before markers fade away (default: 30)

### Map Settings

- **Base Layer**: Choose from multiple map styles
- **Zoom**: Interactive zoom controls
- **View**: Pan and explore the global map

### Topic Filtering

Click on any topic in the statistics panel to filter the map view:
- Click on `origin`, `cache`, or `monitor` to show only those markers
- Click again to remove the filter
- Multiple filters can be active simultaneously

## Technical Details

### Architecture

- **Frontend Framework**: Vanilla JavaScript (ES6+)
- **MQTT Client**: MQTT.js v5.3.5
- **Mapping Library**: Leaflet.js v1.9.4
- **Styling**: Tailwind CSS
- **Message Format**: WIS2 Notification Message Schema

### Message Parsing

Messages are parsed according to the [WIS2 Notification Message Schema](https://github.com/wmo-im/wis2-notification-message). The parser extracts:
- GeoJSON geometry (Point, Polygon, LineString)
- Metadata (publication time, data ID, metadata ID)
- Properties and links

### Browser Requirements

- **Modern Browsers Only**: Chrome, Firefox, Safari, Edge (latest versions)
- **WebSocket Support**: Required for MQTT over WebSocket
- **JavaScript**: Must be enabled
- **LocalStorage**: Used for saving user preferences

## File Structure

```
wis2-live-mapper/
├── index.html              # Main application page
├── config/
│   └── default.json       # Default broker and topic configuration
├── css/
│   └── styles.css         # Custom styles and animations
├── js/
│   ├── app.js             # Main application controller
│   ├── config-manager.js  # Configuration management
│   ├── mqtt-client.js     # MQTT connection handler
│   ├── message-parser.js  # WIS2 message parser
│   ├── map-viewer.js      # Leaflet map management
│   └── stats-panel.js     # Statistics and topic tree
└── README.md              # This file
```

## Development

### Running Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/jmaxmarno/wis2-live-mapper.git
   cd wis2-live-mapper
   ```

2. Serve the files using any web server:
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx http-server

   # Or simply open index.html in your browser
   ```

3. Open `http://localhost:8000` in your browser

### Customization

#### Adding Custom Brokers

Edit `config/default.json` to add custom broker configurations:

```json
{
  "id": "custom-broker",
  "name": "My Custom Broker",
  "host": "broker.example.com",
  "connections": [
    {
      "protocol": "wss",
      "port": 443,
      "url": "wss://broker.example.com:443"
    }
  ],
  "username": "username",
  "password": "password"
}
```

#### Adjusting Colors

Modify topic colors in `config/default.json`:

```json
{
  "pattern": "origin/a/wis2/#",
  "name": "Origin",
  "color": "#3B82F6"
}
```

#### Changing Default Settings

Update default settings in `config/default.json`:

```json
{
  "settings": {
    "maxMessages": 1000,
    "markerFadeDuration": 30,
    "defaultZoom": 2,
    "defaultCenter": [0, 0],
    "markerSize": 8
  }
}
```

## Deployment

### GitHub Pages

This application is designed to work seamlessly with GitHub Pages:

1. Push your changes to GitHub
2. Go to repository Settings → Pages
3. Select source: Deploy from branch `main` or `gh-pages`
4. Select folder: `/` (root)
5. Save and wait for deployment

Your application will be available at: `https://yourusername.github.io/wis2-live-mapper/`

### Other Hosting

The application is entirely static and can be hosted on:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Any web server

Simply upload all files and serve them as static content.

## Performance Tips

1. **Limit Max Messages**: Lower values (500-1000) perform better on slower devices
2. **Increase Fade Duration**: Longer fade times mean fewer updates but more markers visible
3. **Filter Topics**: Use topic filtering to reduce the number of visible markers
4. **Close Unused Connections**: Disconnect when not actively viewing to save bandwidth

## Troubleshooting

### Connection Issues

- **"Connection failed"**: Check if the selected broker is accessible from your network
- **Firewall blocking**: WSS (port 443) usually works better through firewalls than MQTTS (port 8883)
- **No messages appearing**: Wait a few moments - message frequency varies by topic and time of day

### Performance Issues

- **Slow map rendering**: Reduce max markers or increase fade duration
- **High CPU usage**: Close other browser tabs and reduce visible marker count
- **Memory warnings**: Clear the map periodically using the "Clear Map" button

### Browser Compatibility

- **Safari**: Some older versions may have WebSocket issues - update to latest version
- **Mobile browsers**: The application works on mobile but is optimized for desktop viewing

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

### Development Guidelines

1. Follow existing code style and conventions
2. Test with multiple browsers before submitting
3. Update documentation for any new features
4. Ensure backward compatibility with saved preferences

## License

MIT License - See LICENSE file for details

## Acknowledgments

- **WMO**: For the WIS2 system and global broker infrastructure
- **Leaflet.js**: Excellent open-source mapping library
- **MQTT.js**: Reliable MQTT client for browsers
- **OpenStreetMap**: Community-driven map data

## References

- [WIS2 Notification Message Schema](https://github.com/wmo-im/wis2-notification-message)
- [WMO WIS2 Documentation](https://community.wmo.int/en/activity-areas/wis)
- [Leaflet Documentation](https://leafletjs.com/)
- [MQTT.js Documentation](https://github.com/mqttjs/MQTT.js)

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact the repository maintainer

---

**Built with ❤️ for the meteorological community**
