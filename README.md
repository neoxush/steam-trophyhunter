# Steam Trophy Hunter

A lightweight HTML toolkit for tracking and hunting Steam achievements across multiple games.

## ✨ Features

### 🌐 Zero Dependencies
- **Pure HTML/CSS/JavaScript** - No external dependencies or installation required
- **Single-page application** that works entirely in your browser
- **Offline capable** - Once loaded, works without internet connection (except for AI features)

### 📋 Progress Sync via Copy & Paste
- **No login required** - Update your progress by simply copying and pasting from your Steam profile
- **Smart parsing** - Automatically detects completed achievements from pasted Steam achievement text
- **Bulk sync** - Mark multiple achievements as completed in one operation
- **Safe sync options** - Choose between normal sync or overwrite mode

### 🤖 AI-Powered Achievement Guides
- **Multiple AI providers** - Choose from Google Gemini, ChatGPT, Claude, or Perplexity
- **Custom prompts** - Generate detailed guides for individual achievements or batch requests
- **Multi-language support** - Get guides in Chinese, English, Japanese, Korean, Spanish, French, or German
- **Batch processing** - Generate guides for all incomplete achievements at once

### 📤 Easy Sharing & Backup
- **Base64 export** - Share your entire progress with a single encoded string
- **Import/Export** - Backup your data and restore it on any device
- **Cross-device sync** - Transfer your achievement progress between different computers

## 🚀 Quick Start

1. **Download** the project files to your local machine
2. **Open `index.html`** in your web browser
3. **Add your first game** using the App ID from Steam
4. **Start hunting!**

## 📖 Usage Guide

### Adding Games
1. Click the `➕` button in the navigation
2. Enter the Steam App ID (e.g., `2499860` for Helldivers 2)
3. Enter the game name
4. Click "Add" to fetch all achievements

### Syncing Progress
1. Go to your Steam Achievements page for the game
2. Press `Ctrl + A` to select all text
3. Press `Ctrl + C` to copy
4. Click the `📋` button in the app and paste the text
5. Click "Sync Progress" to automatically mark completed achievements

### Getting AI Guides
1. Click on any achievement to open the guide modal
2. Choose your preferred AI provider in settings
3. Customize the prompt or use the default
4. Check "Include all incomplete achievements" for batch processing
5. Click "Okay, take me there" to open the AI service with your prompt

### Sharing Progress
1. Click the `💾` button to open data management
2. Click "Copy to Clipboard" in the Export section
3. Share the Base64 string with others or save it as backup
4. Import by pasting the string into the Import section

## 🎮 Supported Features

- **Multi-game tracking** - Manage achievements for multiple games simultaneously
- **Dark/Light theme** - Toggle between themes for comfortable viewing
- **Search & Filter** - Find achievements quickly with search and status filters
- **Progress statistics** - Track completion percentage and counts
- **Responsive design** - Works on desktop and mobile devices

## 🔧 Technical Details

### File Structure
```
steam-trophyhunter/
├── index.html          # Main application interface
├── app.js              # Core application logic
├── styles.css          # Styling and themes
├── guide_modal.html    # Guide generation interface
└── README.md           # This documentation
```

### Data Storage
- Uses browser's `localStorage` for persistent data
- All data is stored locally on your device
- No server-side storage or tracking

### AI Integration
- Supports multiple AI services via web interface
- Automatically formats prompts for optimal results
- Customizable prompt templates for different achievement types

## 🌍 Language Support

The application and AI guides support:
- Chinese (中文)
- English
- Japanese (日本語)
- Korean (한국어)
- Spanish (Español)
- French (Français)
- German (Deutsch)

## 🔒 Privacy & Security

- **100% local** - All data stored on your device
- **No tracking** - No analytics or user data collection
- **No login required** - Works completely offline
- **Open source** - Transparent code you can review

## 📝 License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.

## 🤝 Contributing

Feel free to submit issues, feature requests, or pull requests to improve this tool!

---

**Steam Trophy Hunter v1.1** - Your achievement hunting companion! 🏆
