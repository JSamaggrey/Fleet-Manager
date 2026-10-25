/**
 * CSV for reporting/interchange only (never restorable). RFC 4180 quoting, CRLF line ends, and a
 * UTF-8 byte-order mark so spreadsheet apps detect the encoding (e.g. "GH₵", "—").
 */
export type CsvCell = string | number | null;

/** UTF-8 byte-order mark. */
const BOM = String.fromCharCode(0xfeff);
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
/** Characters that make spreadsheet apps evaluate a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null) return '';
  let text = String(value);
  // Neutralise formula injection in text cells (e.g. a vendor named "=HYPERLINK(...)").
  if (typeof value === 'string' && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
