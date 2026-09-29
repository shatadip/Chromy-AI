# Software Requirements Specification — Chromy AI: Ask / Task / Repeat

| Field | Value |
|---|---|
| Product | Chromy AI — Ask / Task / Repeat (Chrome extension) |
| Version | 1.2.0 |
| Owner | Shatadip Majumder ([@shatadip](https://github.com/shatadip)) |
| Status | Approved for v1.2.0 release |
| License | MIT |

### Revision history
| Version | Summary |
|---|---|
| 1.0.0 | Ask / Task / Repeat, Gemini (BYOK), short memory, repo governance |
| 1.1.0 | Local engines (Chrome on-device AI, Ollama) with automatic fallback |
| 1.2.0 | Child-simple local AI onboarding, Claude/OpenAI keys, automatic model choice, world globe, Socrates mode, prompt score, "Question it", streaks, tests + CI, store launch assets |

## 1. Introduction

### 1.1 Purpose
Chromy AI is an open-source Chrome extension that coaches people to write better AI prompts, runs prompts on the page they're reading or the web, and lets them repeat saved prompts. v1.2 makes free local AI the default path for everyone, including non-technical users.

### 1.2 Scope
Chromy AI runs entirely in the browser. It answers with the first available of five engines: Chrome's on-device model, Ollama on the user's computer, or Gemini / Claude / OpenAI with keys the user supplies. There is no Chromy backend, no accounts and no analytics.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Ask | Prompt coaching: score, fixes and an improved prompt (Coach) or three probing questions (Socrates) |
| Task | Executes a prompt, optionally with the current tab's text and/or web search |
| Repeat | Library of saved prompts, re-run in one click |
| Brain | A local AI model (Ollama), in user-facing copy |
| Engine | One of: on-device, Ollama, Gemini, Claude, OpenAI |
| Spark | One answered request, counted locally for streaks |

## 2. Overall description

### 2.1 Product perspective
Manifest V3 extension: toolbar popup, options page, first-run welcome page and an ES-module service worker. Requests run in the worker so they finish even if the popup closes (except Chrome's on-device model, which runs in the page that asked).

### 2.2 Users
- **Everyday AI users** (primary, incl. non-technical): want better answers without learning prompt engineering or paying.
- **Power users**: have API keys, want web search and their favourite model.
- **Local-AI enthusiasts**: already run Ollama.

### 2.3 Constraints
- Chrome 116+; no remote code; no build step; plain HTML/CSS/JS; minimal permissions.
- Local models on older CPUs are slow (first token ~15–25 s for a 3B model); the UI must stay responsive and honest about it.

## 3. Functional requirements

### 3.1 Onboarding: local AI a child can set up (goal 1)
- **FR-O1** On install, the welcome page opens automatically.
- **FR-O2** If Chrome's on-device AI is supported, it is offered first (one click; one-time download with progress).
- **FR-O3** Otherwise a 4-step path is shown; each step unlocks the next and ticks itself when detected:
  1. **Allow**: one click requests the optional localhost permission.
  2. **Install Ollama**: OS-specific download button; the page polls every 2 s and ticks when Ollama is running.
  3. **Give it a brain**: recommends a model for the device's RAM (`qwen2.5` 1.5b/3b/7b), downloads it through Ollama's API with a progress bar and fun status lines; cancellable. Skipped automatically if a usable model already exists.
  4. **Say hi**: runs a short test answer, then shows the pin/shortcut tip.
- **FR-O4** No terminal commands on Windows or Mac. Linux shows the one-line install command.
- **FR-O5** The popup and options page show a "Set up free local AI" call to action whenever no local engine is ready.
- **FR-O6** The `Origin` header is removed from the extension's own requests to Ollama (declarativeNetRequest), so no `OLLAMA_ORIGINS` configuration is needed.

### 3.2 Engines, keys and fallback (goal 2)
- **FR-E1** Engines: Chrome on-device AI, Ollama (`127.0.0.1:11434`), Gemini, Claude (Anthropic), OpenAI.
- **FR-E2** Default order: on-device → Ollama → Gemini → Claude → OpenAI. A preferred engine goes first; the rest remain fallbacks.
- **FR-E3** With **Search the web**, web-capable engines (Gemini, Claude) go first; if they fail, a local engine answers, labelled "offline: no web search".
- **FR-E4** A missing, unconfigured, unreachable, rate-limited or failing engine is skipped. Only if all fail does the user see one error listing each engine's reason and a setup link.
- **FR-E5** Every answer shows the engine (and model for Ollama) that produced it.
- **FR-E6** API keys live under **Advanced**. **Connect** requests the provider's optional host permission (Claude/OpenAI), validates the key by listing models, and auto-selects a model.
- **FR-E7** Claude requests use the Messages API with `claude-opus-5-5` by default, low effort, server-side refusal fallback, the web search tool when searching, `pause_turn` continuation, and refusal handling.

### 3.3 Automatic model choice (goal 3)
- **FR-C1** Ollama: the best installed chat model is chosen automatically: the largest that fits the device's RAM, ties broken by model family; embedding models are ignored.
- **FR-C2** The choice is re-evaluated whenever models change; the options page shows "Auto: <model> (best for this computer)".
- **FR-C3** Once the user picks a model manually, it is kept while installed; choosing "Auto" returns control to Chromy.
- **FR-C4** Gemini / OpenAI / Claude pick a sensible default from the account's model list on Connect.
- **FR-C5** Options auto-save on change (with a brief "Saved ✓"), and refresh engine status when the tab regains focus.

### 3.4 Around the world (goal 4)
- **FR-W1** A dependency-free canvas globe (Natural Earth land dots) shows countries where Chromy is used, sized by share, with electric arcs from the user's country.
- **FR-W2** Data comes from `stats/countries.json` in the public repo: aggregate per-country totals copied by the owner from the Chrome Web Store dashboard (`scripts/update-stats.mjs`). The extension collects nothing.
- **FR-W3** "You are probably here" is guessed locally from time zone and language, labelled as a guess, and never sent anywhere.
- **FR-W4** With no stats yet, the globe says Chromy is new and invites the user's country to light up first.
- **FR-W5** The globe pauses off-screen, supports drag-to-spin and hover labels, and is static with reduced motion.

### 3.5 Ask / Task / Repeat
- **FR-A0** (1.2.1) Ask classifies each message: a **question** gets a direct answer (80–200 words) plus a 💡 prompt tip (rule-based fallback if the model omits it); a **prompt** meant for another AI gets coached (FR-A1/A2). A one-click switch re-runs the other way. Streaming updates only the reply text (no re-render flicker).
- **FR-A1** Coach: first line `Score: NN/100`, then verdict, up to 3 fixes, an optional kind "Human touch" note about typos/slips, and an improved prompt in a copyable block. The score is parsed out and shown as an animated meter.
- **FR-A2** Socrates: score + exactly three probing questions + "Plato's hint"; no rewrite.
- **FR-A3** "🤔 Question it" on the latest answer asks the engine to examine its own answer for mistakes and correct it.
- **FR-T1** Task with **Use this page** (≤12,000 chars; ≤6,000 on-device) and **Search the web**, with clear errors on protected pages.
- **FR-R1** Save, run, edit, rename, delete, export/import prompts (max 50); four starter prompts can be added in one click; prompts ending in a blank line wait for pasted text instead of running.
- **FR-M1** Short memory of the last N turns (default 10, 0–20), clearable.

### 3.6 Personality (goal 5)
- **FR-P1** Electric visual language: bolt icon, glow, sheen on primary buttons, spark bursts on send / save / copy / high scores (≥85), animated score meter.
- **FR-P2** Rotating loading lines (Socrates, Plato, electricity, human mistakes) and streamed partial text while waiting.
- **FR-P3** Plato/Socrates quotes from public-domain translations in empty states; deliberate misattributions are included and explicitly flagged as such.
- **FR-P4** Local "sparks" counter and daily streak in the popup footer; never transmitted.
- **FR-P5** Effects can be turned off, and are disabled with `prefers-reduced-motion`.

### 3.7 Growth (goal 6)
- **FR-G1** One-time, dismissible rating nudge after 5 answers, linking to the store reviews page (GitHub when not installed from the store).
- **FR-G2** Share buttons (X, LinkedIn, WhatsApp, Reddit) in options.
- **FR-G3** Store listing, 5 screenshots, small tile and marquee generated from the real UI (`scripts/e2e.mjs` + `scripts/store-assets.mjs`); launch kit with channel-specific copy.

## 4. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Privacy | Data leaves the device only to the engine that answers, on explicit user action. No telemetry. The globe fetch sends no user data. |
| NFR-2 | Security | Keys stored locally, sent only in the provider's auth header. Model output rendered as text (no `innerHTML`), links limited to http(s), strict CSP, no remote code, no `eval`. |
| NFR-3 | Permissions | Required: `storage`, `activeTab`, `scripting`, `declarativeNetRequestWithHostAccess`, Gemini host. Optional (asked in context): Ollama localhost, Anthropic, OpenAI. |
| NFR-4 | Performance | No external fonts/libraries; popup interactive <200 ms; model preloaded on popup open; streaming for local engines; worker kept alive during long local answers. |
| NFR-5 | Reliability | Automatic fallback; short Gemini rate limits retried once; the popup never gets stuck loading; late streaming writes can't resurrect a finished request. |
| NFR-6 | Quality | Unit tests (`npm test`), static release checks (`scripts/check.mjs`) and CI on every push/PR; real-browser e2e against real Ollama before each release (`scripts/e2e.mjs`). |
| NFR-7 | Accessibility | Keyboard usable, labelled controls, light/dark, reduced motion respected. |

## 5. External interfaces
- Ollama: `GET /api/version`, `GET /api/tags`, `POST /api/pull` (NDJSON progress), `POST /api/chat` (streamed), `POST /api/generate` (warm-up).
- Chrome Prompt API: `LanguageModel.availability/create/prompt/promptStreaming`.
- Gemini: `models.list`, `models.generateContent` (+ `google_search` tool).
- Anthropic: `GET /v1/models`, `POST /v1/messages` (+ `web_search_20260209`, `fallbacks: "default"`).
- OpenAI: `GET /v1/models`, `POST /v1/chat/completions`.
- GitHub raw: `stats/countries.json` (public, aggregate).

## 6. Repository governance
- `main` is release-only (ruleset + CODEOWNERS); contributors target `dev`; an Action retargets outside PRs from `main` to `dev`; CI must pass.
- Release: tests + checks + e2e green → merge `dev` → `main`, tag `vX.Y.Z`, upload `dist/chromy-ai-vX.Y.Z.zip`.

## 7. Out of scope (v1.2)
Accounts/sync, side panel, page automation (clicking/filling), long-term memory, collecting any usage data.

## 8. Acceptance criteria (v1.2.0)
1. Fresh install opens the welcome page; with Ollama running and a model present, steps 1–3 tick themselves and "Try it" answers. ✔ e2e
2. With no model installed, "Download brain" pulls the recommended model with visible progress and then ticks. ✔ unit (pull progress) + manual
3. Options shows "Answering with Ollama · <model>" and "Auto: <model>"; a manual pick sticks; "Auto" restores automatic choice. ✔ e2e + unit
4. Ask returns a parsed score meter; Socrates returns questions; "Question it" re-examines the answer. ✔ e2e + unit
5. Task with "Use this page" answers from a real page. ✔ e2e
6. Gemini 429 during web search falls back to Claude, then to a local engine labelled offline; with everything down, one error lists every engine. ✔ unit
7. Globe renders with the local country guess and no stats; with stats it shows markers and top countries. ✔ e2e + unit
8. No console errors on any page in e2e; `npm test` and `scripts/check.mjs` pass; CI green.
