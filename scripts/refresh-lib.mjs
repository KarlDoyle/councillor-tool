export function isCleanText(value) {
  return typeof value === 'string' && !value.includes('�');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, i) => [header, (values[i] ?? '').trim()])),
  );
}

export function normalizeName(value) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(cllr|councillor|cllr\.)\b/g, '')
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function applyDatasetRows(council, rows, fields = {}, retrieved = '') {
  const byName = new Map();
  for (const row of rows) {
    const name = row[fields.name ?? 'name'] ?? row['full name'] ?? row.councillor;
    if (name) byName.set(normalizeName(name), row);
  }
  if (!byName.size) return { ok: false, refreshed: 0, staleRows: [], notes: [] };

  const result = { ok: true, refreshed: 0, staleRows: [], notes: [] };
  for (const lea of council.leas) {
    for (const councillor of lea.councillors) {
      const match = byName.get(normalizeName(councillor.name));
      if (!match) {
        result.staleRows.push(
          `${councillor.name} (${council.name}) not in refreshed dataset — kept last-good, verify on council site`,
        );
        continue;
      }
      const party = match[fields.party ?? 'party'];
      const email = match[fields.email ?? 'email'];
      let changed = false;
      if (isCleanText(party) && party && party !== councillor.party) {
        councillor.party = party;
        changed = true;
      }
      if (isCleanText(email) && email && email !== councillor.email) {
        councillor.email = email;
        changed = true;
      }
      councillor.retrieved = retrieved;
      result.refreshed++;
      if (changed) result.notes.push(`${councillor.name}: party/email updated from ${council.id} dataset`);
    }
  }
  return result;
}

export function classifyLinkFailure(status) {
  if ([404, 410].includes(status)) return 'dead';
  if (typeof status === 'string' && /ENOTFOUND|EAI_AGAIN|certificate/i.test(status)) return 'dead';
  return 'blocked';
}
