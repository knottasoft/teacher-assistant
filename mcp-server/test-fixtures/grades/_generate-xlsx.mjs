/**
 * Преобразует CSV-фикстуры в XLSX, чтобы протестировать реальный путь
 * «учитель скачал XLSX из ЭлЖур/МЭШ → перетащил в Cowork» без ручной конвертации.
 *
 * Запуск: node test-fixtures/grades/_generate-xlsx.mjs
 */
import * as XLSX from "xlsx";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseCsv(content, delimiter) {
  const rows = [];
  let cur = "", row = [], inQuote = false, i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (inQuote) {
      if (ch === '"') {
        if (content[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuote = false; i++; continue;
      }
      cur += ch; i++; continue;
    }
    if (ch === '"') { inQuote = true; i++; continue; }
    if (ch === delimiter) { row.push(cur); cur = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { row.push(cur); cur = ""; rows.push(row); row = []; i++; continue; }
    cur += ch; i++;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows;
}

const files = readdirSync(__dirname).filter((f) => f.endsWith(".csv"));
for (const f of files) {
  const buf = readFileSync(join(__dirname, f));
  let txt = buf.toString("utf-8");
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  // авто-разделитель
  const sample = txt.slice(0, 2000);
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let q = false;
  for (const c of sample) { if (c === '"') q = !q; else if (!q && c in counts) counts[c]++; }
  const delim = counts[";"] > counts[","] ? ";" : ",";
  const matrix = parseCsv(txt, delim);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  XLSX.utils.book_append_sheet(wb, ws, "Журнал");
  const xlsxName = basename(f, extname(f)) + ".xlsx";
  const out = join(__dirname, xlsxName);
  XLSX.writeFile(wb, out);
  console.log(`  ${f} → ${xlsxName}`);
}
console.log("done");
