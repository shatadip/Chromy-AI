# Chromy AI Privacy Policy

_Last updated: 30 September 2026 (v1.2.0)_

Chromy AI: Ask / Task / Repeat ("the extension") is an open-source Chrome extension by Shatadip Majumder. **It does not collect, sell or share personal data.** The developer runs no server and receives nothing from the extension.

## Stored on your device only
In Chrome's local extension storage (`chrome.storage.local`):
- Settings (preferred engine, model choices, style, memory size).
- API keys for Gemini, Claude or OpenAI, **only if you add them**.
- Short conversation memory (default: last 10 turns). Clear it any time or set it to 0.
- Prompts you save with ★ Save.
- A local counter of answers and your daily streak ("sparks"). It never leaves your device.

## What is sent, and to whom
Only when you press **Ask** or **Run** (or **Try it** during setup), the request goes to the first available AI engine:

| Engine | Where the data goes |
|---|---|
| Chrome on-device AI | Nowhere: processed on your device by Chrome. |
| Ollama | Ollama on your own computer (`127.0.0.1:11434`). Nothing leaves your computer. |
| Gemini (your key) | Google's Gemini API (`generativelanguage.googleapis.com`). |
| Claude (your key) | Anthropic's API (`api.anthropic.com`). |
| OpenAI (your key) | OpenAI's API (`api.openai.com`). |

A request contains your prompt, the recent conversation memory, and, only if you ticked **Use this page**, the current tab's title, URL and visible text (or your selection), up to 12,000 characters. Cloud requests use your own key and are governed by that provider's terms and privacy policy ([Google](https://ai.google.dev/gemini-api/terms), [Anthropic](https://www.anthropic.com/legal/privacy), [OpenAI](https://openai.com/policies/privacy-policy)).

When you download a model during setup, the extension asks your local Ollama to fetch it from Ollama's model library.

## The "around the world" globe
- The globe downloads a public file, `stats/countries.json`, from this project's GitHub repository. It contains only **aggregate per-country totals** that the developer copies from the Chrome Web Store dashboard. This is a plain download; no data about you is sent (GitHub, like any website, sees the request's IP address).
- "You are probably here" is guessed **on your device** from your time zone and language, and is never sent anywhere.

## What the extension never does
- No analytics, tracking, ads, fingerprinting or telemetry.
- No reading of pages in the background. Page text is read only on your explicit action.
- No selling or transferring of data to third parties, and no use of data for purposes unrelated to the extension's single purpose.

## Removing your data
Use **Clear** / **Clear memory now**, delete saved prompts and keys in Settings, or uninstall the extension to remove everything it stored.

## Contact
Open an issue at https://github.com/shatadip/Chromy-AI/issues.
