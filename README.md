# FOMO Saver — Chrome Extension

Save links instantly, find them later with AI-powered search, summaries & smart tags.

## Features

- One-click save from popup or keyboard shortcut (Ctrl+Shift+S)
- Right-click menu — save any page or link via context menu
- AI auto-fill — get summaries, categories & tags from any LLM
- Full-text search across titles, notes, tags, URLs
- Categories & tags for organized browsing
- Star important links
- Export/Import bookmarks as JSON

## Supported AI Providers

| Provider | API Key Required |
|----------|-----------------|
| Anthropic (Claude) | Yes |
| OpenAI (GPT) | Yes |
| Google (Gemini) | Yes |
| Groq | Yes |
| OpenRouter | Yes |
| Ollama / LM Studio | No (local) |
| Custom OpenAI-compatible | Depends |

## Installation

1. Clone this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the project folder
5. Pin the extension to your toolbar

## Setup AI (Optional)

1. Click the settings icon in the extension popup
2. Choose your LLM provider
3. Enter your API key (or set local URL for Ollama)
4. Save & test the connection

## Keyboard Shortcut

`Ctrl+Shift+S` (Mac: `Cmd+Shift+S`) — Quick save current page

## Icons

Generate PNG icons from `icons/icon.svg` at 16x16, 48x48, and 128x128 and save as
`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`.

## Development

No build step needed — pure HTML/CSS/JS with Chrome Extension Manifest V3.

## License

MIT
