// RFC-4180 CSV parse / serialize (client-safe). Handles quoted fields, escaped
// quotes (""), quoted newlines, CRLF/LF/CR line endings and a UTF-8 BOM.

/** Cells starting with these are formulas in Excel/Sheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    // Skip fully blank lines (a lone empty field), keep rows with empty cells.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Undo the export's formula guard: `'=SUM(…)` → `=SUM(…)`. */
export function unguardCell(value: string): string {
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** CRLF-separated CSV with a BOM so Excel opens it as UTF-8. */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const body = rows
    .map((row) => row.map((cell) => escapeCell(cell == null ? '' : String(cell))).join(','))
    .join('\r\n');
  return `﻿${body}\r\n`;
}
