# Software Requirements Specification — Chromy AI: Ask / Task / Repeat

| Field | Value |
|---|---|
| Product | Chromy AI — Ask / Task / Repeat (Chrome extension) |
| Version | 1.0.0 |
| Owner | Shatadip Majumder ([@shatadip](https://github.com/shatadip)) |
| Status | Approved for v1.0.0 release |
| License | MIT |

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for Chromy AI, an open-source Chrome extension that gives short, practical guidance on AI prompts, runs prompts against the current page or the live web, and lets users save prompts to repeat later.

### 1.2 Scope
Chromy AI runs entirely in the user's browser. It talks to exactly one remote service, the Google Gemini API, using an API key that the user supplies. There is no Chromy AI backend, no account system and no analytics.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Ask | Mode that critiques and improves a prompt the user has written, or answers a short question about prompting |
| Task | Mode that executes a prompt, optionally using the current tab's text and/or Google Search grounding |
| Repeat | Library of saved prompt templates that can be re-run in one click |
| Short memory | The last N conversation turns kept locally and sent as context with each request |
| BYOK | Bring your own key: each user provides their own Gemini API key |

## 2. Overall description

### 2.1 Product perspective
Manifest V3 extension with a toolbar popup, an options page and a background service worker. The service worker performs API calls so that a request finishes and is saved even if the popup closes.

### 2.2 Users
- People who use AI tools daily and want better prompts, fast.
- Developers, writers and students who want to run a prompt on the page they're reading.

### 2.3 Constraints
- Chrome 116+ (Manifest V3, ES module service worker).
- No remotely hosted code (Chrome Web Store policy); all JS ships in the package.
- Minimal permissions to keep the store review short.
- No build step; plain HTML/CSS/JS.

### 2.4 Assumptions
- The user can obtain a Gemini API key from Google AI Studio (free tier available).
- Google Search grounding may be billed by Google on some tiers; this is the user's account, and the UI states it.

## 3. Functional requirements

### 3.1 Ask (prompt guidance)
- **FR-A1** The user can type a prompt or question and choose **Ask**.
- **FR-A2** The response is short (target under 150 words) and contains: a verdict, up to 3 concrete fixes, and an improved prompt in a copyable block.
- **FR-A3** The user can copy the improved prompt with one click.

### 3.2 Task (execute)
- **FR-T1** The user can run the typed prompt as a task.
- **FR-T2** Toggle **Use this page**: the visible text of the active tab (max 12,000 characters) is sent as context. Page text is read only when the user runs a task with this toggle on (via `activeTab`).
- **FR-T3** Toggle **Search the web**: the request enables Gemini's Google Search grounding tool; cited sources are shown as links under the answer.
- **FR-T4** Pages where extensions can't run (e.g. `chrome://`, Chrome Web Store) produce a clear message instead of an error.

### 3.3 Repeat (saved prompts)
- **FR-R1** The user can save the current prompt as a named template, including its mode and toggles.
- **FR-R2** The user can run a template in one click, edit it into the input, or delete it.
- **FR-R3** Templates persist across browser restarts (`chrome.storage.local`). Max 50 templates.
- **FR-R4** Templates can be exported and imported as JSON from the options page.

### 3.4 Short context memory
- **FR-M1** The last N turns (default 10, configurable 0–20) are sent as conversation history with each request.
- **FR-M2** Memory is stored only in `chrome.storage.local` on the user's device.
- **FR-M3** The user can clear memory with one click; setting N to 0 disables memory.
- **FR-M4** Reopening the popup shows the recent conversation, including an answer that finished while the popup was closed.

### 3.5 Settings
- **FR-S1** The options page stores the Gemini API key, model id, memory size and default toggles.
- **FR-S2** The model list can be loaded from the Gemini API; default model is `gemini-flash-latest`.
- **FR-S3** A **Test key** button validates the key.
- **FR-S4** If no key is set, the popup shows a link to settings instead of failing.

## 4. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Privacy | No data leaves the browser except requests to `generativelanguage.googleapis.com` made on explicit user action. No telemetry. |
| NFR-2 | Security | The API key is stored in `chrome.storage.local`, sent only in the `x-goog-api-key` header, never logged or put in URLs. |
| NFR-3 | Security | Model output is rendered as text (no `innerHTML` of model output); links are restricted to `http(s)`. Strict extension CSP. |
| NFR-4 | Permissions | Only `storage`, `activeTab`, `scripting`; host permission only for the Gemini API. |
| NFR-5 | Performance | Popup opens in under 200 ms; no external fonts or libraries. |
| NFR-6 | Reliability | API errors (401/403/429/5xx, network) are shown in plain language; the popup never gets stuck in a loading state. |
| NFR-7 | Accessibility | Keyboard usable (Ctrl/Cmd+Enter runs), labelled controls, respects light/dark mode. |
| NFR-8 | Maintainability | Plain JS modules, no build step, documented in README. |

## 5. External interfaces
- **Gemini API** `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `systemInstruction`, `contents` (memory + current turn) and optional `tools: [{ google_search: {} }]`.
- **Gemini API** `GET /v1beta/models` for the model picker and key test.
- **Chrome APIs** `chrome.storage`, `chrome.scripting.executeScript`, `chrome.tabs`, `chrome.runtime` messaging.

## 6. Repository governance
- `main` is the release branch. Nobody except the owner can push or merge to it (GitHub ruleset + CODEOWNERS).
- Contributors fork and open pull requests against `dev`. A GitHub Action automatically retargets any outside pull request aimed at `main` to `dev`.
- Releases: owner merges `dev` → `main`, tags `vX.Y.Z`, uploads the zip to the Chrome Web Store.

## 7. Out of scope (v1)
- Multiple AI providers, accounts/sync, streaming responses, side panel UI, automatic actions on pages (clicking, form filling), long-term memory.

## 8. Acceptance criteria (v1.0.0)
1. With a valid key, Ask returns a short critique and an improved prompt that can be copied.
2. Task with **Use this page** summarises the current article correctly.
3. Task with **Search the web** answers a question about current events and lists sources.
4. A saved template re-runs in one click after a browser restart.
5. A follow-up question uses previous turns; after **Clear memory** it doesn't.
6. Closing the popup mid-request and reopening shows the finished answer.
7. The packaged zip loads without errors or warnings in `chrome://extensions`.
