# Chromy AI: Ask / Task / Repeat

A small, open-source Chrome extension for people who prompt AI all day.

- **Ask**: paste a prompt and get a verdict, up to 3 fixes and an improved version you can copy.
- **Task**: run a prompt on the page you're reading (**Use this page**) or on the live web (**Search the web**, with sources).
- **Repeat**: save prompts and re-run them in one click.
- **Short memory**: remembers the last few turns (default 10) so follow-ups just work. One click clears it.

Powered by Google Gemini with **your own API key** (free tier available). No servers, no accounts, no tracking.

## Install

**Chrome Web Store:** _link coming after review_

**From source:**
1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. The settings page opens. Paste a key from [Google AI Studio](https://aistudio.google.com/app/apikey) and click **Save**.

Shortcut: `Alt+Shift+Y` opens the popup. `Ctrl+Enter` sends.

## Privacy

Your key, memory and saved prompts are stored only in `chrome.storage.local`. Requests go only to `generativelanguage.googleapis.com`, and only when you press Ask/Run. Page text is read only when you tick **Use this page**. See [PRIVACY.md](PRIVACY.md).

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save your settings, short memory and prompts locally |
| `activeTab` + `scripting` | Read the current tab's text, only when you run a task with **Use this page** |
| `generativelanguage.googleapis.com` | Call the Gemini API |

## Project layout

```
extension/        the extension (load this folder unpacked)
  background.js   service worker: Gemini calls + memory
  popup.*         Ask / Task / Repeat UI
  options.*       settings page
  lib/            gemini client, storage helpers
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
