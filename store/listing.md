# Chrome Web Store listing: copy-paste fields

## Name
Chromy AI - Ask / Task / Repeat

## Summary (max 132 chars)
Better AI prompts in seconds. Runs on local AI (Chrome on-device or Ollama) or Gemini. Ask, run tasks on pages or the web, repeat.

## Category
Productivity (secondary: Tools)

## Language
English

## Description
Chromy AI is a tiny prompt coach and task runner that lives in your toolbar.

ASK: paste any prompt and get a one-line verdict, up to 3 concrete fixes, and an improved prompt you can copy in one click.

TASK: run a prompt on the page you're reading ("Summarise this in 5 bullets", "Extract all dates") or tick "Search the web" for fresh answers with cited sources.

REPEAT: save your best prompts and re-run them in one click. Export and import them as JSON.

SHORT MEMORY: remembers the last few turns so follow-ups just work. Clear it with one click.

ALWAYS ANSWERS: runs on Chrome's built-in on-device AI, on Ollama on your own computer, or on Google Gemini with your own key. If one engine is missing, offline or over quota, the next one answers automatically.

PRIVATE BY DESIGN
• Local engines keep everything on your computer.
• Gemini is optional and uses your own API key (free tier at aistudio.google.com).
• No servers, no accounts, no analytics.
• Page text is read only when you ask it to.
• Open source (MIT): https://github.com/shatadip/Chromy-AI

Shortcut: Alt+Shift+Y opens Chromy AI. Ctrl+Enter sends.

## Privacy practices tab

**Single purpose:**
Help users write better AI prompts and run them on the current page or the web, using on-device AI, the user's local Ollama, or the user's own Google Gemini API key.

**Permission justifications:**
- `storage`: Saves the user's settings, API key, short conversation memory and saved prompts locally on the device.
- `activeTab`: Reads the text of the current tab only when the user runs a task with "Use this page" ticked.
- `scripting`: Injects a one-off function into the active tab (granted via activeTab) to read its visible text or selection when the user asks.
- Host permission `https://generativelanguage.googleapis.com/*`: Sends the user's prompt to the Google Gemini API when the user has added a key. This is the only remote service the extension talks to.
- Optional host permissions `http://localhost:11434/*` and `http://127.0.0.1:11434/*`: Requested only when the user clicks "Connect Ollama", to send prompts to the Ollama AI server running on the user's own computer.
- `declarativeNetRequestWithHostAccess`: One rule that removes the Origin header from the extension's own requests to the local Ollama server (localhost:11434), which otherwise rejects browser-extension origins. It does not touch any other traffic.

**Remote code:** No, I am not using remote code.

**Data usage (tick):**
- Website content: collected only when the user chooses "Use this page", sent only to the AI engine that answers (on-device, the user's local Ollama, or Google Gemini).
- Personally identifiable info / health / financial / authentication / location / web history / user activity: not collected. (The API key is the user's own credential, stored locally and sent only to Google as authentication.)

Certify all three: not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending.

**Privacy policy URL:**
https://github.com/shatadip/Chromy-AI/blob/main/PRIVACY.md

## Assets needed
- Icon 128×128: `extension/icons/icon128.png` ✅
- At least 1 screenshot, 1280×800 or 640×400 (PNG/JPEG): take from the popup (see README)
- Small promo tile 440×280 (optional but recommended)
