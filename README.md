# Chromy AI: Ask / Task / Repeat

A small, open-source Chrome extension for people who prompt AI all day.

- **Ask**: paste a prompt and get a verdict, up to 3 fixes and an improved version you can copy.
- **Task**: run a prompt on the page you're reading (**Use this page**) or on the live web (**Search the web**, with sources).
- **Repeat**: save prompts and re-run them in one click.
- **Short memory**: remembers the last few turns (default 10) so follow-ups just work. One click clears it.

No servers, no accounts, no tracking.

## AI engines: always an answer

Chromy tries engines in order and falls back automatically when one is missing, offline or over quota:

| Engine | Cost | Needs | Internet |
|---|---|---|---|
| **Chrome on-device AI** (Gemini Nano) | Free | Chrome 138+, >4 GB VRAM or 16 GB RAM, 22 GB free disk | No |
| **Ollama** (local) | Free | [Ollama](https://ollama.com/download) + a model, e.g. `ollama pull llama3.2:3b` | No |
| **Gemini** (cloud) | Free tier / paid | API key from [Google AI Studio](https://aistudio.google.com/app/apikey) | Yes, and the only engine that can **Search the web** |

Default order: on-device → Ollama → Gemini. With **Search the web** ticked, Gemini goes first, and a local engine answers (without web results) if Gemini fails. Each answer shows which engine produced it.

### Ollama setup
1. Install Ollama and pull a model: `ollama pull llama3.2:3b` (older/low-RAM PCs: `qwen2.5:1.5b`).
2. In Chromy settings, click **Connect Ollama** and allow access to `localhost:11434`.
3. If you see a 403 error, set the environment variable `OLLAMA_ORIGINS=chrome-extension://*` and restart Ollama.

## Install

**Chrome Web Store:** _link coming after review_

**From source:**
1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. The settings page opens. Set up at least one engine (see above) and click **Save**.

Shortcut: `Alt+Shift+Y` opens the popup. `Ctrl+Enter` sends.

## Privacy

Your key, memory and saved prompts are stored only in `chrome.storage.local`. Requests go only to the engine that answers (on-device, your own `localhost:11434`, or `generativelanguage.googleapis.com`), and only when you press Ask/Run. Page text is read only when you tick **Use this page**. See [PRIVACY.md](PRIVACY.md).

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save your settings, short memory and prompts locally |
| `activeTab` + `scripting` | Read the current tab's text, only when you run a task with **Use this page** |
| `generativelanguage.googleapis.com` | Call the Gemini API |
| `localhost:11434` (optional, asked on **Connect Ollama**) | Talk to Ollama on your own computer |
| `declarativeNetRequestWithHostAccess` | Remove the `Origin` header on Chromy's own requests to local Ollama, so Ollama accepts them without extra config |

## Project layout

```
extension/        the extension (load this folder unpacked)
  background.js   service worker: runs requests, Ollama header rule
  popup.*         Ask / Task / Repeat UI
  options.*       settings page
  lib/engine.js   engine chain + fallback
  lib/local.js    Chrome on-device AI + Ollama clients
  lib/gemini.js   Gemini client
  lib/store.js    storage helpers
docs/SRS.md       software requirements specification
store/            Chrome Web Store listing copy
scripts/          icon generator, packaging script
```

## Build a release zip

```bash
node scripts/package.mjs
```

This writes `dist/chromy-ai-v<version>.zip`, ready to upload to the Chrome Web Store.

## Contributing

Contributions are welcome. Open your pull request against the **`dev`** branch. `main` is release-only and maintained by the owner. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Shatadip Majumder
