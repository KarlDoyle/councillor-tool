# ops/ — the zero-touch loop

Karl's requirement: after the one-time gates, he never touches this again.

**The loop (monthly, lights-out):** `monthly-refresh.yml` (staged here, inert —
GitHub only runs workflows from `.github/workflows/`, where DEPLOY.md's Option A
moves it at deploy time) runs `scripts/refresh.mjs`:

1. Re-fetch the open datasets in `data/sources.json` and refresh party/email per
   councillor (name-matched; hand-curated `focus` fields are never overwritten).
2. Validate every official-profile / record link.
3. **Graceful degradation** — any dataset failure or dead link keeps the last-good
   data (the tool already shows its retrieved date on-page) and lands in the
   report; nothing ever breaks the site. If the whole workflow errors, Pages keeps
   serving the previous deploy and a loud issue is opened.
4. Rebuild `data/councillors.json` + `data/councillors.js`, commit, redeploy Pages.
5. Comment the monthly self-report (rows refreshed · links dead · action needed —
   ideally none) on the standing "Monthly self-report" issue; the issue is open
   only while action is needed.

**Free tier, no servers, no keys** — the built-in `GITHUB_TOKEN` is the only
credential.

**The gates that stay human (one-time):** first deploy go · listing go · atom
publish go. Everything after those is this loop.
