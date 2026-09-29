# Changelog

## 1.2.2
- **Automatic updates:** Chromy installs a downloaded update as soon as it isn't busy answering (no browser restart needed) and tells you once: "Updated to vX ⚡".
- Checks for updates when you open it (at most every 6 hours) and at browser start; Settings → **Updates** shows your version and a "Check for updates" button.
- Behind the scenes: every new version is tested, released on GitHub and published to the Chrome Web Store automatically.

## 1.2.1
- **Ask now answers questions.** "What is thiamin?" gets a real answer plus a 💡 prompt tip; prompts meant for another AI ("write a blog post…") still get the score, fixes and a better prompt. One click switches either way ("💬 Just answer it" / "⚡ Coach this prompt").
- A 💡 tip is always shown for questions (rule-based fallback when a small model forgets it, and inline "Prompt tip:" is detected).
- **No more blinking while answering:** streaming updates only the text of the reply; the entrance animation plays once per message; scrolling up while it streams is respected.
- Code blocks are robust to small-model fence mistakes (double-wrapped, nested, unclosed).
- Questions and prompt coaching keep separate memory, so formats don't bleed into each other.

## 1.2.0 — "Electrified"
**Free local AI for everyone**
- New first-run setup a 10-year-old can finish: Allow → install Ollama (OS-specific button, detected automatically) → Chromy downloads a model sized for your RAM with a progress bar → Say hi. No terminal.
- Chrome's built-in on-device AI is offered first on machines that support it.
- Automatic model choice: the best installed model for your computer, re-picked when you add models, until you choose one yourself.
- Friendly nudge toward free local AI when running on a cloud key (snoozable).

**Advanced**
- Bring your own **Claude** or **OpenAI** key (alongside Gemini). Connect validates the key and picks a model. Claude supports web search with sources.
- Engine chain: on-device → Ollama → Gemini → Claude → OpenAI, with automatic fallback.

**Personality**
- Prompt score (0-100) with an animated meter; kind "Human touch" notes about typos.
- 🏛 Socrates mode: three probing questions instead of a rewrite.
- 🤔 "Question it": the AI examines its own answer for mistakes.
- Electric look: bolt icon, glow, sparks, rotating loading lines, Plato & Socrates quotes (misattributions included and flagged).
- Local sparks counter and daily streak. Four starter prompts in Repeat.

**Around the world**
- Spinning dotted globe of countries using Chromy (aggregate Chrome Web Store numbers from this repo). Your own country is guessed locally and never sent.

**Quality**
- Settings auto-save; engine status refreshes on focus.
- Fixed: a stuck on-device availability check could stall requests (now times out).
- 37 unit tests, static release checks, CI on every push/PR, and a real-Chrome + real-Ollama end-to-end test.

## 1.1.0
- Local engines (Chrome on-device AI, Ollama) with automatic fallback; streaming; model warm-up.

## 1.0.0
- Ask / Task / Repeat with Gemini (bring your own key), short memory, repo governance.
