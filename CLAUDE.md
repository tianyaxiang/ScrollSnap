# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ScrollSnap is a Chrome browser extension for capturing web page screenshots. It supports:
- Full page scrolling screenshots (auto-scroll and stitch)
- Visible area screenshots
- Selection/region screenshots (supports scrolling during selection)
- Batch tab screenshots (up to 50 tabs, full page or visible area modes)

Built with Chrome Extension Manifest V3 and vanilla JavaScript.

## Development Setup

### Loading the Extension
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `scroll-capture-extension` folder

### Testing Changes
- After code changes, click the refresh icon on `chrome://extensions/` or reload the extension
- For popup changes, close and reopen the popup
- For content script changes, reload the target web page
- For background script changes, reload the extension

### Debugging
- **Popup**: Right-click extension icon > Inspect popup
- **Background Service Worker**: `chrome://extensions/` > Details > "Inspect views: service worker"
- **Content Script**: Open DevTools on target page, console logs will appear there

## Architecture

```
scroll-capture-extension/
├── manifest.json          # Extension config, permissions, commands
├── background.js          # Service Worker - capture orchestration, image stitching
├── content.js             # Content script - selection UI, scroll control, progress display
├── offscreen.js           # Offscreen document for clipboard operations
├── popup/
│   ├── popup.html/css/js  # Main UI - capture buttons, preview, batch panel
├── utils/
│   ├── i18n.js            # Runtime language switching (zh_CN, en)
│   ├── settings.js        # User settings management
│   └── image-processor.js # Image utilities
└── _locales/              # Localization files
```

### Key Components

**background.js** - Core capture logic:
- `captureVisibleArea()` - Single viewport capture
- `captureFullPage()` - Scrolling capture with image stitching using OffscreenCanvas
- `captureScrollSelection()` - Selection capture supporting scrollable containers
- `batchCaptureAllTabs()` - Multi-tab batch capture
- Message handling for popup/content script communication

**content.js** - Page interaction:
- Selection overlay UI with document coordinate tracking
- Auto-detection of scrollable containers (for SPAs like claude.ai)
- Progress indicator display
- Preview panel with copy/save actions
- Batch results panel

**popup/popup.js** - User interface:
- Capture mode buttons
- Format selection (PNG/JPEG with quality slider)
- Batch capture tab selector
- Settings panel with language toggle

### Communication Flow
```
Popup → sendMessage → Background (orchestrates) → executeScript/sendMessage → Content Script
                                                → captureVisibleTab → Chrome API
```

## Key Technical Details

### Scrolling Screenshot Algorithm
1. Get page dimensions via content script
2. Scroll to top, capture first viewport
3. Hide fixed/sticky elements after first capture
4. Loop: scroll by viewport height, wait 550ms (Chrome rate limit), capture
5. Restore fixed elements, restore scroll position
6. Stitch images using OffscreenCanvas (accounts for DPI)

### Selection with Scrolling
- Uses document coordinates (not viewport) to track selection
- Detects scrollable containers automatically (important for SPAs)
- Converts between document and viewport coordinates for display
- Supports edge auto-scroll during selection

### Batch Capture
- Stores task info in `chrome.storage.local` before closing popup
- Background script reads task and executes captures sequentially
- Shows progress on each tab during capture
- Results displayed in a panel on the original tab

## Chrome APIs Used
- `chrome.tabs.captureVisibleTab` - Screenshot capture (rate limited to ~2/sec)
- `chrome.scripting.executeScript` - Inject code for scroll/selection
- `chrome.storage.sync/local` - Settings and temporary data
- `chrome.downloads` - Save images
- `chrome.commands` - Keyboard shortcuts
- `chrome.offscreen` - Clipboard operations

## Keyboard Shortcuts
- `Alt+Shift+S` - Full page screenshot
- `Alt+Shift+V` - Visible area screenshot
- `Alt+Shift+A` - Selection screenshot

## Internationalization
Runtime language switching via `utils/i18n.js`. Supported: `zh_CN`, `en`.
- Use `data-i18n` attributes in HTML
- Messages in `_locales/{lang}/messages.json`
- `window.i18n.getMessage(key)` for JS strings
