# Refresh validation and fallback

The scheduled workflow runs `node scripts/refresh.mjs`. The script fetches configured datasets, matches records by normalised name, checks official links, writes generated site data and produces `ops/refresh-report.md`.

## Dataset handling

- A fetch or parse failure is recorded and the existing record values are kept.
- A councillor missing from a fetched dataset is reported and their last-good fields are retained.
- Party and email values containing the Unicode replacement character are rejected to avoid saving text damaged by a wrong character encoding.
- Hand-curated fields are left alone.

## Link handling

HTTP 404/410 and selected DNS or certificate failures are reported as dead. Other failures, including 403 and 5xx responses, are reported as unverifiable from the runner. The distinction avoids treating a site that blocks automated clients as a confirmed dead page.

## Failure boundary

Soft dataset and link failures appear in the report. If the whole workflow fails, the current GitHub Pages deployment remains available and a separate workflow job opens an issue. A successful workflow commits generated data and deploys it; running the workflow therefore has external side effects. For a local refresh, run only the script after saving a copy of generated data. Do not use `workflow_dispatch` as a local verification command.

The publisher's [dataset metadata](https://data.smartdublin.ie/dataset/councillor-detail-dcc) says the configured DCC dataset was last updated on 23 April 2025. The refresh date records when this project retrieved it, not when the council last changed the underlying records.
