# Get it fixed — Dublin councillor contact tool

**Live at: https://karldoyle.github.io/councillor-tool/**

The broken light, the dangerous junction, the derelict site on your street — your
local councillor is elected, and paid, to act on exactly this. This free tool finds
your councillors and writes the email: pick the problem, pick your area, get the
right people (ranked by their public committee seats), send from your own mail app.

- **No accounts, no tracking, no backend.** Nothing you type leaves the page — the
  email opens in your own mail client and you send it yourself.
- **Covers** Dublin City Council and Dún Laoghaire–Rathdown, so far.
- **Self-maintaining.** A monthly GitHub Action re-fetches the open datasets,
  validates every official link, keeps last-good data on any failure, redeploys,
  and posts a self-report issue (see `ops/README.md`).
- **Facts, not scores.** Councillors are shown with their party and public
  committee seats, plus links to their official profile and attendance/minutes.
  No ratings, no rankings of people — read the record and judge for yourself.

## Data & attribution

Contains Irish Public Sector Data (Dublin City Council; Dún Laoghaire–Rathdown
County Council) licensed under CC BY 4.0, compiled from official council websites
and [data.gov.ie](https://data.gov.ie) open datasets. Councillors change party,
resign, or get co-opted between elections — always verify against the council's
official site (linked throughout).

## Feedback

Wrong name, dead link, your council missing, an idea?
[Open an issue](https://github.com/KarlDoyle/councillor-tool/issues) — feedback
very welcome.

## Licence

Code: MIT (see `LICENSE`). Data: CC BY 4.0 as attributed above.

Companion to the guide *Get Your Local Councillor to Act*.
