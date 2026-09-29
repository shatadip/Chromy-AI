# Chromy AI launch kit

Ready-to-post copy for launch day. Replace `STORE_URL` with the Chrome Web Store link once approved (until then use https://github.com/shatadip/Chromy-AI). Attach `store/screenshots/screenshot-1-score.png` (or a 20-second screen recording of the popup scoring a prompt; video beats images everywhere).

## Launch-day order (all within ~2 hours, so momentum stacks)
1. Chrome Web Store live → install it yourself from the store, leave the first honest review from a friend (never fake reviews).
2. **Show HN** (weekday, ~8-10am US Eastern).
3. **Reddit**: r/ollama and r/LocalLLaMA (they love local-first), then r/chrome_extensions, r/PromptEngineering. One post per sub, different wording, reply to every comment.
4. **X / LinkedIn** posts below, pin the X post.
5. **Product Hunt** the following Tuesday-Thursday (00:01 PT), with the marquee image as the gallery hero.
6. Reply to everyone for 48 hours. Turn the best feature requests into `dev` issues with the `good first issue` label.

---

## Show HN
**Title:** Show HN: Chromy AI – a free prompt coach for Chrome that runs on local AI

**Text:**
I kept rewriting my prompts by hand, so I built a small Chrome extension that scores a prompt 0-100, suggests up to three fixes and gives you a better version. It runs on local AI by default: a guided setup installs Ollama and downloads a model sized for your RAM (no terminal), or it uses Chrome's built-in on-device model on newer machines. Nothing leaves your computer unless you add your own Gemini/Claude/OpenAI key.

A few things I had fun with: a Socrates mode that answers with three questions instead of a rewrite, a "Question it" button that makes the model examine its own answer, and automatic fallback between engines so it always answers. Plain JS, Manifest V3, no build step, MIT.

Code: https://github.com/shatadip/Chromy-AI
Store: STORE_URL

Would love feedback on the scoring prompt and the setup flow.

## Reddit: r/ollama / r/LocalLLaMA
**Title:** I made a Chrome extension that sets up Ollama for non-technical people and uses it to score & fix prompts

**Body:**
Most of my friends will never open a terminal, so the setup is: click Allow → install Ollama → Chromy downloads a model picked for your RAM (qwen2.5 1.5b/3b/7b) with a progress bar → done. It auto-picks the best installed model afterwards and handles the chrome-extension Origin issue so you don't need OLLAMA_ORIGINS.

Then it scores any prompt 0-100, gives fixes and a rewrite, has a Socrates mode, and can summarise the page you're on. Streams tokens, keeps the model warm, works fine on an 8 GB / i5 with no GPU (~20 s to first token).

Free, MIT, no tracking: https://github.com/shatadip/Chromy-AI. Happy to hear what models you'd recommend for the default.

## Reddit: r/chrome_extensions / r/PromptEngineering
**Title:** Free extension: paste any prompt, get a 0-100 score, fixes and a better prompt (runs locally)

**Body:** Short demo in the screenshot. Local AI by default (Ollama or Chrome's on-device model), or your own Gemini/Claude/OpenAI key. There's also a Socrates mode that asks you three questions instead of rewriting. Feedback very welcome: STORE_URL

## X (pin this)
Your prompts, electrified ⚡

I built Chromy AI, a free Chrome extension that:
• scores any prompt 0-100
• fixes it (or lets Socrates question you 🏛)
• runs on the page you're reading
• runs on YOUR computer: free local AI, set up in 2 clicks

No key. No bill. No tracking.
STORE_URL

## LinkedIn
Most AI answers are only as good as the prompt behind them, and most of us never learned to write prompts.

So I built Chromy AI, a free Chrome extension that scores any prompt from 0 to 100, suggests concrete fixes and gives you an improved version. It runs on local AI on your own computer (a guided setup does the technical bits), so prompts stay private and there's no subscription.

My favourite feature: "Question it". One click and the AI examines its own answer for mistakes, the way Socrates would. Humans make mistakes; so do AIs, and it's healthy to ask.

It's open source (MIT). I'd love your feedback: STORE_URL

#AI #PromptEngineering #Productivity #OpenSource

## Product Hunt
**Tagline (≤60):** Score, fix & question your AI prompts, on local AI
**Description:** Chromy AI is a free Chrome prompt coach. Paste a prompt, get a 0-100 score, fixes and a better version, or let Socrates ask you three sharp questions. Runs on local AI (guided 2-click setup) or your own key. Private, open source.
**First comment:** the story of why you built it + one honest limitation (small local models on older CPUs take ~20 s).

## Growth loops already in the product
- Setup ends with a delightful "Say hi" moment → people screenshot it.
- After 5 answers, a one-time, dismissible "⭐ Rate" nudge links to the store reviews page.
- Settings → "Spread the spark" share buttons (X, LinkedIn, WhatsApp, Reddit).
- The globe lights up new countries as installs grow: post "Chromy is now used in N countries 🌍" updates (refresh with `scripts/update-stats.mjs`).
