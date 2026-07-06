#!/usr/bin/env node
// Monthly self-maintenance for the councillor contact tool. No dependencies, Node 20+.
//
// What it does (zero-touch loop):
//   1. Re-fetches the open datasets listed in data/sources.json (data.gov.ie etc.).
//   2. Refreshes the machine-refreshable fields per councillor (party, email) by
//      name-match against the dataset. Hand-curated fields (focus) are never touched.
//   3. Validates every official-profile and record URL.
//   4. Graceful degradation: any fetch failure or dead link keeps the last-good data
//      (its retrieved date is already shown in the UI) and is reported, never fatal.
//   5. Regenerates data/councillors.js (the file:// loader) from councillors.json.
//   6. Writes ops/refresh-report.md — the monthly self-report posted as an issue
//      comment by the workflow. "Action needed: none" is the goal state.
//
// Exit code is always 0; the report carries the signal. GitHub outputs:
//   action_needed=true|false, dead_links=<n>, rows_refreshed=<n>

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = new Date().toISOString().slice(0, 10);

const data = JSON.parse(readFileSync(join(ROOT, 'data/councillors.json'), 'utf8'));
let sources = [];
try { sources = JSON.parse(readFileSync(join(ROOT, 'data/sources.json'), 'utf8')).datasets ?? []; }
catch { /* no sources file → link-validation-only mode */ }

const report = { refreshed: 0, deadLinks: [], blocked: [], datasetFailures: [], staleRows: [], notes: [] };

async function fetchOk(url, asText = false, encoding = 'utf-8') {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30000),
      headers: { 'user-agent': 'councillor-tool-monthly-refresh (community tool; contact via repo issues)' } });
    if (!res.ok) return { ok: false, status: res.status };
    // Decode explicitly: e.g. the DCC CSV is windows-1252, and reading it as UTF-8
    // mangles accented names/parties (Fianna Fáil → F�il) and breaks name-matching.
    return { ok: true, body: asText ? new TextDecoder(encoding).decode(await res.arrayBuffer()) : null };
  } catch (e) { return { ok: false, status: String(e.message ?? e) }; }
}
const clean = s => typeof s === 'string' && !s.includes('�'); // refuse mojibake

// Minimal CSV parser (quoted fields, commas, newlines)
function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(cllr|councillor|cllr\.)\b/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

// ---- 1+2: dataset refresh --------------------------------------------------
for (const src of sources) {
  const council = data.councils.find(c => c.id === src.council_id);
  if (!council) continue;
  const res = await fetchOk(src.url, true, src.encoding ?? 'utf-8');
  if (!res.ok) { report.datasetFailures.push(`${src.council_id}: ${src.url} → ${res.status} (kept last-good)`); continue; }
  let rows;
  try {
    rows = src.format === 'json' ? JSON.parse(res.body) : parseCsv(res.body);
    if (!Array.isArray(rows)) rows = rows.results ?? rows.records ?? rows.data ?? [];
  } catch (e) { report.datasetFailures.push(`${src.council_id}: parse failed (${e.message}) (kept last-good)`); continue; }
  const byName = new Map();
  for (const r of rows) {
    const name = r[src.fields?.name ?? 'name'] ?? r['full name'] ?? r['councillor'];
    if (name) byName.set(norm(name), r);
  }
  if (!byName.size) { report.datasetFailures.push(`${src.council_id}: dataset empty/unrecognised (kept last-good)`); continue; }
  for (const lea of council.leas) for (const c of lea.councillors) {
    const match = byName.get(norm(c.name));
    if (!match) { report.staleRows.push(`${c.name} (${council.name}) not in refreshed dataset — kept last-good, verify on council site`); continue; }
    const party = match[src.fields?.party ?? 'party'];
    const email = match[src.fields?.email ?? 'email'];
    let changed = false;
    if (clean(party) && party && party !== c.party) { c.party = party; changed = true; }
    if (clean(email) && email && email !== c.email) { c.email = email; changed = true; }
    c.retrieved = today; report.refreshed++;
    if (changed) report.notes.push(`${c.name}: party/email updated from ${src.council_id} dataset`);
  }
}

// ---- 3: link validation ----------------------------------------------------
const urls = new Map(); // url → labels
for (const council of data.councils) {
  if (council.list_url) urls.set(council.list_url, [`${council.name} list page`]);
  for (const lea of council.leas) for (const c of lea.councillors)
    for (const k of ['profile_url', 'record_url'])
      if (c[k]) urls.set(c[k], [...(urls.get(c[k]) ?? []), `${c.name} ${k}`]);
}
// Dead = the resource is gone (404/410) or the domain no longer resolves. A 403/429/5xx
// from a CI runner usually means the council site bot-blocks datacentre IPs (verified
// 2026-07-06: councilmeetings.dublincity.ie 403s GitHub runners but serves browsers fine)
// — report those as unverifiable, never as action-needed, or every month cries wolf.
const HARD_DEAD = new Set([404, 410]);
for (const [url, labels] of urls) {
  const res = await fetchOk(url);
  if (res.ok) continue;
  const gone = HARD_DEAD.has(res.status) ||
    (typeof res.status === 'string' && /ENOTFOUND|EAI_AGAIN|certificate/i.test(res.status));
  if (gone) report.deadLinks.push(`${url} → ${res.status} (${labels.join(', ')}) — kept last-good`);
  else report.blocked.push(`${url} → ${res.status} (${labels.join(', ')}) — likely bot-blocking of CI IPs, fine in a browser`);
}

// ---- 4+5: write outputs ----------------------------------------------------
data.generated = today;
writeFileSync(join(ROOT, 'data/councillors.json'), JSON.stringify(data, null, 2) + '\n');
writeFileSync(join(ROOT, 'data/councillors.js'),
  '// GENERATED from councillors.json by scripts/refresh.mjs — do not edit by hand.\n' +
  'window.COUNCILLOR_DATA = ' + JSON.stringify(data, null, 2) + ';\n');

const actionNeeded = report.deadLinks.length > 0 || report.datasetFailures.length > 0;
const md = [
  `# Monthly self-report — ${today}`, '',
  `- Rows refreshed from open datasets: **${report.refreshed}**`,
  `- Dead links: **${report.deadLinks.length}**`,
  `- Unverifiable from CI (bot-blocked, fine in a browser): **${report.blocked.length}**`,
  `- Dataset failures: **${report.datasetFailures.length}**`,
  `- Rows kept last-good (not in refreshed dataset): **${report.staleRows.length}**`,
  `- **Action needed: ${actionNeeded ? 'yes — see below' : 'none'}**`, '',
  ...(report.deadLinks.length ? ['## Dead links', ...report.deadLinks.map(l => `- ${l}`), ''] : []),
  ...(report.blocked.length ? ['## Unverifiable from CI', ...report.blocked.map(l => `- ${l}`), ''] : []),
  ...(report.datasetFailures.length ? ['## Dataset failures', ...report.datasetFailures.map(l => `- ${l}`), ''] : []),
  ...(report.staleRows.length ? ['## Kept last-good', ...report.staleRows.map(l => `- ${l}`), ''] : []),
  ...(report.notes.length ? ['## Changes applied', ...report.notes.map(l => `- ${l}`), ''] : []),
].join('\n');
writeFileSync(join(ROOT, 'ops/refresh-report.md'), md + '\n');
console.log(md);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT,
    `action_needed=${actionNeeded}\ndead_links=${report.deadLinks.length}\nrows_refreshed=${report.refreshed}\n`);
}
