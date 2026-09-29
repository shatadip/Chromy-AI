# Releasing Chromy AI (automatic updates)

## How updates reach users

```
npm run release  ──►  push to main  ──►  GitHub Action "Release"
                                           ├─ tests + checks
                                           ├─ GitHub Release (zip + notes)
                                           └─ Chrome Web Store: upload + publish (API v2)
                                                      │  Google review (usually hours–1 day)
                                                      ▼
                        every store install updates itself (Chrome checks every few hours;
                        Chromy installs the downloaded update as soon as it's idle and shows
                        "Updated to vX ⚡" once)
```

- **A push only ships when the version number goes up.** The store rejects re-used versions, and the Action skips pushes whose version already has a release. `npm run release` bumps it for you.
- **Folder installs (Load unpacked) never auto-update**: that's a Chrome rule. Use the store version for everyday use; for development, `git pull` and click ↻ on `chrome://extensions`.

## Everyday: ship an update

```bash
npm run release            # 1.2.1 → 1.2.2 (bug fixes)
npm run release -- minor   # 1.2.1 → 1.3.0 (new features)
```

It must run on a clean `main`. It bumps the version in `manifest.json` and `package.json`, adds a CHANGELOG section (from commit subjects, unless you already wrote `## <new version>` yourself), runs the tests and checks, commits `Release vX.Y.Z`, and pushes `main` (and fast-forwards `dev`). The Action does the rest; watch it under **Actions → Release**.

## One-time setup (≈10 minutes)

1. **First store submission is manual.** Upload the zip in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/), fill in the listing and privacy tabs (`store/listing.md`), and submit. The API can only update an item that already exists.
2. **Find two IDs**
   - *Extension ID*: in the dashboard item URL / item page (32 letters).
   - *Publisher ID*: Dashboard → **Settings** (publisher section).
3. **Create a service account** (Google Cloud Console)
   1. Create/select a project → search **Chrome Web Store API** → **Enable**.
   2. **IAM & Admin → Service accounts → Create** (no roles needed).
   3. Open it → **Keys → Add key → JSON**. Keep the downloaded file private.
4. **Link it to the store**: Developer Dashboard → **Account** → add the service account's email. (One service account per publisher.)
5. **Add GitHub secrets**: repo → Settings → Secrets and variables → Actions → *New repository secret*:

   | Secret | Value |
   |---|---|
   | `CWS_EXTENSION_ID` | extension ID |
   | `CWS_PUBLISHER_ID` | publisher ID |
   | `CWS_SERVICE_ACCOUNT_JSON` | the whole JSON key file contents |

   (Alternative to the service account: an OAuth client + refresh token as `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, scope `https://www.googleapis.com/auth/chromewebstore`.)

Until the secrets exist, the Action still creates GitHub Releases and just skips the store step with a warning.

Requirements from Google: 2-step verification on the publisher account; if you change visibility in the dashboard, publish once manually before the API can publish again.

## If something goes wrong
- **"version … already released"**: you pushed without bumping. Run `npm run release`.
- **Upload FAILED: version**: the store already has this or a higher version. Bump and release again.
- **Publish warnings**: shown in the Action log (e.g. listing incomplete). Fix in the dashboard, then re-run the workflow (**Actions → Release → Run workflow**) after bumping.
