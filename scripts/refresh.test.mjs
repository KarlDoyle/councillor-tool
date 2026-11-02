import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  applyDatasetRows,
  classifyLinkFailure,
  isCleanText,
  normalizeName,
  parseCsv,
} from './refresh-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('parses quoted commas, escaped quotes, CRLF and embedded newlines', () => {
  const rows = parseCsv('Name,Party,Note\r\n"Cllr Áine O\'Brien","Green, Independent","Said ""yes""\nand stayed"\r\n');
  assert.deepEqual(rows, [
    { name: "Cllr Áine O'Brien", party: 'Green, Independent', note: 'Said "yes"\nand stayed' },
  ]);
});

test('normalises accents and councillor titles for name matching', () => {
  assert.equal(normalizeName('Cllr. Daithí Ó Doolan'), 'daithi o doolan');
});

test('rejects text with replacement characters from a bad decode', () => {
  assert.equal(isCleanText('Fianna Fáil'), true);
  assert.equal(isCleanText('Fianna F�il'), false);
  assert.equal(isCleanText(null), false);
});

test('updates only clean party and email fields and stamps matched rows', () => {
  const council = {
    id: 'dcc',
    name: 'Dublin City Council',
    leas: [{ councillors: [{ name: 'Áine O’Brien', party: 'Old Party', email: 'old@example.ie', focus: 'Keep this' }] }],
  };
  const result = applyDatasetRows(
    council,
    [{ name: 'Aine O’Brien', party: 'New Party', email: 'new@example.ie' }],
    {},
    '2026-11-02',
  );
  assert.deepEqual(result, {
    ok: true,
    refreshed: 1,
    staleRows: [],
    notes: ["Áine O’Brien: party/email updated from dcc dataset"],
  });
  assert.equal(council.leas[0].councillors[0].party, 'New Party');
  assert.equal(council.leas[0].councillors[0].email, 'new@example.ie');
  assert.equal(council.leas[0].councillors[0].focus, 'Keep this');
  assert.equal(council.leas[0].councillors[0].retrieved, '2026-11-02');
});

test('keeps last-good values and reports rows missing from the source', () => {
  const council = {
    id: 'dcc',
    name: 'Dublin City Council',
    leas: [{ councillors: [{ name: 'Missing Member', party: 'Existing', email: 'keep@example.ie' }] }],
  };
  const result = applyDatasetRows(council, [{ name: 'Someone Else', party: 'Other' }], {}, '2026-11-02');
  assert.equal(result.refreshed, 0);
  assert.match(result.staleRows[0], /kept last-good/);
  assert.equal(council.leas[0].councillors[0].party, 'Existing');
  assert.equal(council.leas[0].councillors[0].email, 'keep@example.ie');
});

test('classifies hard-gone and DNS failures as dead, but bot blocks as unverifiable', () => {
  assert.equal(classifyLinkFailure(404), 'dead');
  assert.equal(classifyLinkFailure(410), 'dead');
  assert.equal(classifyLinkFailure('getaddrinfo ENOTFOUND example.ie'), 'dead');
  assert.equal(classifyLinkFailure(403), 'blocked');
  assert.equal(classifyLinkFailure(503), 'blocked');
});

test('generated browser data matches the canonical JSON file', () => {
  const json = JSON.parse(readFileSync(join(ROOT, 'data/councillors.json'), 'utf8'));
  const source = readFileSync(join(ROOT, 'data/councillors.js'), 'utf8');
  const window = {};
  runInNewContext(source, { window });
  assert.equal(JSON.stringify(window.COUNCILLOR_DATA), JSON.stringify(json));
});
