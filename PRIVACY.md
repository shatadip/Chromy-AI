# Chromy AI Privacy Policy

_Last updated: 29 September 2026_

Chromy AI: Ask / Task / Repeat ("the extension") is an open-source Chrome extension. This policy explains what data it handles.

## What the extension stores
Stored **only on your device** in Chrome's local extension storage (`chrome.storage.local`):
- Your Google Gemini API key, if you add one.
- Your settings (model, memory size, defaults).
- Short conversation memory (the last few prompts and answers, default 10 turns). You can clear it at any time or set it to 0.
- Prompts you save with ★ Save.

The developer has no server and never receives any of this data.

## What is sent, and to whom
When you press **Ask** or **Run**, the request goes to the first available AI engine:
- **Chrome on-device AI**: processed entirely on your device by Chrome's built-in model. Nothing leaves your computer.
- **Ollama**: sent to Ollama running on your own computer (`localhost:11434`). Nothing leaves your computer.
- **Gemini (cloud)**: sent to Google's Gemini API (`generativelanguage.googleapis.com`), only if you added an API key.

The request contains:
- your prompt and the recent conversation memory;
- if you ticked **Use this page**: the title, URL and visible text (or your selection) of the current tab, up to 12,000 characters;
- if you ticked **Search the web**: a flag asking Gemini to use Google Search grounding.

Gemini requests are authenticated with your own API key. Google's handling of this data is governed by the [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms) and [Google's Privacy Policy](https://policies.google.com/privacy). On free tiers, Google may use API content to improve its products.

## What the extension does not do
- No analytics, tracking, ads or telemetry.
- No reading of pages in the background. Page text is read only on your explicit action.
- No selling or transferring of data to third parties, and no use of data for purposes unrelated to the extension's single purpose.

## Removing your data
Click **Clear memory**, delete saved prompts, or uninstall the extension to remove all stored data.

## Contact
Open an issue at https://github.com/shatadip/Chromy-AI/issues.
