# Chrome Web Store listing: copy-paste fields

## Name
Chromy AI - Ask / Task / Repeat

## Summary (max 132 chars)
Better AI prompts in seconds. Ask for fixes, run tasks on any page or the web, and repeat saved prompts. Uses your own Gemini key.

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

PRIVATE BY DESIGN
• Uses your own Google Gemini API key (free tier available at aistudio.google.com).
• No servers, no accounts, no analytics.
• Page text is read only when you ask it to.
• Open source (MIT): https://github.com/shatadip/Chromy-AI

Shortcut: Alt+Shift+Y opens Chromy AI. Ctrl+Enter sends.

## Privacy practices tab

**Single purpose:**
Help users write better AI prompts and run them on the current page or the web using the user's own Google Gemini API key.

**Permission justifications:**
- `storage`: Saves the user's settings, API key, short conversation memory and saved prompts locally on the device.
- `activeTab`: Reads the text of the current tab only when the user runs a task with "Use this page" ticked.
- `scripting`: Injects a one-off function into the active tab (granted via activeTab) to read its visible text or selection when the user asks.
- Host permission `https://generativelanguage.googleapis.com/*`: Sends the user's prompt to the Google Gemini API, the only service the extension talks to.

**Remote code:** No, I am not using remote code.

**Data usage (tick):**
- Website content: collected only when the user chooses "Use this page", sent to Google Gemini to answer the request.
- Personally identifiable info / health / financial / authentication / location / web history / user activity: not collected. (The API key is the user's own credential, stored locally and sent only to Google as authentication.)

Certify all three: not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending.

**Privacy policy URL:**
https://github.com/shatadip/Chromy-AI/blob/main/PRIVACY.md

## Assets needed
- Icon 128×128: `extension/icons/icon128.png` ✅
- At least 1 screenshot, 1280×800 or 640×400 (PNG/JPEG): take from the popup (see README)
- Small promo tile 440×280 (optional but recommended)
