# Contributing to WIS2 Live Mapper

Thank you for your interest in contributing to WIS2 Live Mapper! This document provides guidelines for contributing to the project.

## How to Contribute

### Reporting Issues

If you find a bug or have a suggestion:

1. Check if the issue already exists in the [Issues](https://github.com/jmaxmarno/wis2-live-mapper/issues) section
2. If not, create a new issue with:
   - Clear, descriptive title
   - Detailed description of the problem or suggestion
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Browser and OS information
   - Screenshots if applicable

### Submitting Changes

1. **Fork the Repository**
   ```bash
   git clone https://github.com/jmaxmarno/wis2-live-mapper.git
   cd wis2-live-mapper
   ```

2. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Your Changes**
   - Follow the existing code style
   - Test your changes in multiple browsers
   - Update documentation if needed

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "Add feature: description"
   ```

5. **Push and Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a pull request on GitHub

## Development Guidelines

### Code Style

- Use ES6+ JavaScript features
- Use clear, descriptive variable and function names
- Add comments for complex logic
- Keep functions focused and concise
- Follow existing patterns in the codebase

### Testing

Before submitting:

- [ ] Test in Chrome, Firefox, Safari, and Edge
- [ ] Test connection to all 4 global brokers
- [ ] Verify responsive design on different screen sizes
- [ ] Check console for errors or warnings
- [ ] Test with various message volumes
- [ ] Verify configuration persistence works

### Documentation

- Update README.md for user-facing changes
- Add inline code comments for complex logic
- Update configuration examples if needed

## Project Structure

```
wis2-live-mapper/
├── index.html              # Main application page
├── config/
│   └── default.json       # Default configuration
├── css/
│   └── styles.css         # Custom styles
├── js/
│   ├── app.js             # Main controller
│   ├── config-manager.js  # Config handling
│   ├── mqtt-client.js     # MQTT connection
│   ├── message-parser.js  # Message parsing
│   ├── map-viewer.js      # Map management
│   └── stats-panel.js     # Statistics display
└── README.md
```

## Feature Requests

We welcome feature requests! When suggesting a feature:

1. Explain the use case
2. Describe the expected behavior
3. Consider how it fits with existing features
4. Be open to discussion and alternatives

## Questions?

If you have questions about contributing:

- Open a discussion in the Issues section
- Tag it with "question" label

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Accept constructive criticism
- Focus on what's best for the community

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to WIS2 Live Mapper! 🌍
