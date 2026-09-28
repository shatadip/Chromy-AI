# Contributing to Chromy AI

Thanks for helping out!

## Branch model

| Branch | Purpose | Who can merge |
|---|---|---|
| `main` | Released code, matches the Chrome Web Store | Owner only |
| `dev` | Integration branch for all contributions | Owner (after review) |

- **Always open pull requests against `dev`.** Pull requests that target `main` are automatically retargeted to `dev` by a bot.
- The owner merges `dev` into `main` for each release.

## Workflow
1. Fork the repo and create a branch from `dev`: `git checkout -b fix/short-description dev`.
2. Load `extension/` unpacked in `chrome://extensions` and test your change.
3. Keep pull requests small and focused. Describe what changed and how you tested it.
4. Open the pull request against `dev`.

## Ground rules
- No remote code, trackers, analytics or new third-party network calls.
- No new permissions without discussion in an issue first.
- Never render model output with `innerHTML`.
- Plain JS, no build step.

## Reporting bugs and ideas
Use [GitHub Issues](https://github.com/shatadip/Chromy-AI/issues). For security problems, please don't open a public issue; use GitHub's **Report a vulnerability** (Security tab) instead.
