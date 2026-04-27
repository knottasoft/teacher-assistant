/**
 * grade_analytics — статистический анализ оценок.
 *
 * Поддерживает форматы:
 *   • CSV/TSV-экспорты российских электронных журналов (МЭШ, Дневник.ру, Сетевой Город,
 *     ЭлЖур, ИРТех) — автодетект разделителя (`,` / `;` / `\t`), 2-уровневая шапка
 *     (даты + типы работ; темы уроков), метаданные класса, обозначения Н/Б/н/а/0/ЗАЧ.
 *   • XLSX (через `xlsx`) — конвертация в матрицу строк, далее тот же CSV-конвейер.
 *   • Кодировки: UTF-8, UTF-8 BOM, Windows-1251 (через `iconv-lite`, с эвристикой).
 *   • Простой CSV `ФИО,оценка1,...` (для регрессии и быстрых вводов).
 *   • JSON `[{student, grades}]` (для API-интеграций).
 *
 * Расширения над простой статистикой:
 *   • Каждой оценке прикрепляется {date, work_type, lesson_topic} если они есть в шапке.
 *   • Параметры фильтрации: `period`, `date_from`, `date_to`, `work_type`.
 *   • Не-аттестованные ученики (только Н/Б/н/а в ячейках) попадают в выборку как
 *     not_attested и в students_at_risk с особым reason.
 *   • Анонимизация ФИО (по умолчанию ON): возвращает псевдонимы вида «Ученик #N» в
 *     основном выводе и `name_map` отдельным полем, чтобы скилл /grade-report мог
 *     писать реальные ФИО только в локальный файл, а не в LLM-промпт.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import iconv from "iconv-lite";
import * as XLSX from "xlsx";

// ===========================================================================
// Types
// ===========================================================================

export interface DatedGrade {
  value: number;             // 2..5
  date?: string;             // ISO YYYY-MM-DD when known
  work_type?: string;        // "Т", "КР", "ДЗ", "СР", "ПР", "КС", "ЧН" и т.п.
  lesson_topic?: string;
}

export interface GradeEntry {
  student: string;
  grades: DatedGrade[];
  absences: number;
  illnesses: number;
  not_attested: boolean;
}

export interface ParsedMetadata {
  school?: string;
  class?: string;
  subject?: string;
  period?: string;
  teacher?: string;
  hours_per_week?: number;
  academic_year?: string;
  raw_period_dates?: { from?: string; to?: string };
}

export interface ColumnSchema {
  index: number;
  date?: string;
  work_type?: string;
  lesson_topic?: string;
  is_total?: boolean;        // «За II четверть», «Средний балл»
  raw_header?: string;
}

export interface ParseResult {
  entries: GradeEntry[];
  metadata: ParsedMetadata | null;
  columns: ColumnSchema[];
  delimiter: string;
  format_hint: string;
  warnings: string[];
}

// ===========================================================================
// Encoding detection: UTF-8 / UTF-8 BOM / Windows-1251
// ===========================================================================

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

export function decodeBuffer(buf: Buffer): { text: string; encoding: string } {
  // 1. BOM strip
  if (buf.length >= 3 && buf.slice(0, 3).equals(UTF8_BOM)) {
    return { text: buf.slice(3).toString("utf-8"), encoding: "utf-8-bom" };
  }
  // 2. Try UTF-8 first
  const utf8 = buf.toString("utf-8");
  // Эвристика: если встречаются U+FFFD (replacement) или странные cp1251-сигнатуры —
  // переключаемся на cp1251. Сигнатура: куча байт >= 0xC0 в исходном буфере + при
  // декодировании UTF-8 получаются �.
  if (utf8.includes("�")) {
    try {
      const win1251 = iconv.decode(buf, "win1251");
      return { text: win1251, encoding: "windows-1251" };
    } catch {
      return { text: utf8, encoding: "utf-8?" };
    }
  }
  return { text: utf8, encoding: "utf-8" };
}

// ===========================================================================
// Token classification
// ===========================================================================

const NAME_RE = /^[А-ЯЁ][а-яёА-ЯЁ\-']+(\s+[А-ЯЁ][а-яёА-ЯЁ\-']*\.?)+/;
const PSEUDO_NAME_RE = /^Учен[ия]к[\s ]+[A-Za-zА-ЯЁа-яё0-9]+[-_][0-9]+/i;
const FIRST_NAME_INITIAL_RE = /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]?\.?$/;

export function looksLikeStudentName(cell: string): boolean {
  const t = cell.trim().replace(/^"|"$/g, "");
  if (!t) return false;
  if (NAME_RE.test(t)) return true;
  if (PSEUDO_NAME_RE.test(t)) return true;
  if (FIRST_NAME_INITIAL_RE.test(t)) return true;
  return false;
}

const ABSENCE_TOKENS = new Set(["н", "n", "h"]);
const ILLNESS_TOKENS = new Set(["б", "b"]);
const NOT_ATTESTED_TOKENS = new Set(["н/а", "н-а", "н\\а", "не атт.", "не аттестован", "na"]);

export type CellKind = "grade" | "absence" | "illness" | "not_attested" | "empty" | "other";

export function classifyCell(raw: string): { kind: CellKind; value?: number } {
  const cleaned = raw.trim().replace(/^"|"$/g, "").toLowerCase();
  if (!cleaned) return { kind: "empty" };
  if (NOT_ATTESTED_TOKENS.has(cleaned)) return { kind: "not_attested" };
  if (ABSENCE_TOKENS.has(cleaned)) return { kind: "absence" };
  if (ILLNESS_TOKENS.has(cleaned)) return { kind: "illness" };
  // Чистая отметка: 2..5, иногда «5+», «4-», «3.»
  const m = cleaned.match(/^([2-5])\s*[+\-.]?\s*$/);
  if (m) return { kind: "grade", value: parseInt(m[1], 10) };
  // Несколько оценок через ; или /: «4/5», «5,3» — берём первую
  const multi = cleaned.match(/^([2-5])\s*[\/;,]\s*[2-5]/);
  if (multi) return { kind: "grade", value: parseInt(multi[1], 10) };
  return { kind: "other" };
}

// ===========================================================================
// CSV parsing (auto-delimiter, multi-line cells, quotes)
// ===========================================================================

const CANDIDATES = [",", ";", "\t"];

export function detectDelimiter(content: string): string {
  // Анализируем первые 30 содержательных строк (но осторожно: cell может быть multi-line).
  // Эвристика: считаем разделители вне кавычек на первых ~3000 символах.
  const sample = content.slice(0, 3000);
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuote = false;
  for (const ch of sample) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (inQuote) continue;
    if (ch in counts) counts[ch]++;
  }
  const best = CANDIDATES.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  return counts[best] > 0 ? best : ",";
}

/**
 * Парсит CSV-текст в матрицу строк. Уважает кавычки `"..."`, удвоенные кавычки `""`,
 * многострочные ячейки (перенос строки внутри кавычек). Поддерживает любой разделитель.
 */
export function parseCsv(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuote = false;
  let i = 0;
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
    if (ch === "\n") {
      row.push(cur); cur = "";
      rows.push(row);
      row = [];
      i++; continue;
    }
    cur += ch; i++;
  }
  // финальная строка
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // удаляем хвостовые полностью пустые строки
  while (rows.length && rows[rows.length - 1].every((c) => !c.trim())) rows.pop();
  return rows;
}

// ===========================================================================
// XLSX → matrix
// ===========================================================================

export function parseXlsx(buf: Buffer): string[][] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  return aoa.map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));
}

// ===========================================================================
// Metadata extraction (from header rows above data anchor)
// ===========================================================================

// Разделитель между ключом и значением может быть `:`, `|`, `;` или их комбинацией
// (зависит от того, что попало в одну ячейку и как row.join(" | ") склеил).
// Используем «liberal separator»: `\s*[:|;,#№]+\s*\|?\s*` — серия знаков пунктуации
// и пробелов.
const SEP = String.raw`\s*[:|;#№]\s*\|?\s*`;

const META_PATTERNS: { key: keyof ParsedMetadata; re: RegExp }[] = [
  { key: "school",  re: new RegExp(`(образоват(ельн[ао]я)?\\s+(организация|учрежден[ие])|школ[аы]?|МКОУ|ГБОУ|МАОУ|МБОУ|МКУ|ОУ|ОО)${SEP}"?([^"|\\n]+)"?`, "i") },
  { key: "class",   re: new RegExp(`(класс|class)${SEP}"?(\\s*\\d{1,2}\\s*[А-Яа-яA-Za-z]?(?:\\s*класс)?)\\s*(?:\\||$)`, "i") },
  { key: "subject", re: new RegExp(`(предмет|subject)${SEP}"?([^"|\\n]+?)\\s*(?:\\||$)`, "i") },
  { key: "period",  re: new RegExp(`(период|четверть|полугодие|триместр|период обучения)${SEP}"?([^"|\\n]+?)\\s*(?:\\||$)`, "i") },
  { key: "teacher", re: new RegExp(`(учитель|преподаватель|teacher|ФИО учителя|кл\\.?\\s*рук)${SEP}"?([^"|\\n]+?)\\s*(?:\\||$)`, "i") },
];

const HOURS_RE = /учебн[а-я]+\s+час[а-я]+\s+в\s+неделю\s*[:|;#№]+\s*\|?\s*"?(\d+)"?/i;
const ACADEMIC_YEAR_RE = /(\d{4})\s*[–\-]\s*(\d{4})\s*уч/;

export function extractMetadata(headerRows: string[][]): ParsedMetadata | null {
  if (headerRows.length === 0) return null;
  const meta: ParsedMetadata = {};
  for (const row of headerRows) {
    const joined = row.join(" | ");
    for (const { key, re } of META_PATTERNS) {
      if (meta[key]) continue;
      const m = joined.match(re);
      if (m) {
        const val = (m[m.length - 1] || "").trim().replace(/^"|"$/g, "");
        if (val) (meta as Record<string, unknown>)[key] = val;
      }
    }
    const hm = joined.match(HOURS_RE);
    if (hm && !meta.hours_per_week) meta.hours_per_week = parseInt(hm[1], 10);
    const ym = joined.match(ACADEMIC_YEAR_RE);
    if (ym && !meta.academic_year) meta.academic_year = `${ym[1]}-${ym[2]}`;
  }
  return Object.keys(meta).length ? meta : null;
}

// ===========================================================================
// Anchor detection: first row that looks like student data
// ===========================================================================

interface AnchorResult {
  rowIndex: number;
  studentColumn: number;
  gradeStartColumn: number;
  topicRowIndex: number | null;   // вторая строка шапки (темы уроков), если есть
  dateRowIndex: number | null;    // строка с датами + типами работ
}

function isCandidateAnchorRow(cells: string[]): { studentCol: number; gradeStart: number } | null {
  for (let col = 0; col <= Math.min(2, cells.length - 1); col++) {
    if (looksLikeStudentName(cells[col])) {
      let goodTokens = 0;
      for (let j = col + 1; j < cells.length; j++) {
        const k = classifyCell(cells[j]);
        if (k.kind === "grade" || k.kind === "absence" || k.kind === "illness" || k.kind === "not_attested") {
          goodTokens++;
        }
      }
      if (goodTokens >= 2) return { studentCol: col, gradeStart: col + 1 };
    }
  }
  return null;
}

// Strict patterns: даты только в формате DD.MM.YYYY/DD.MM.YY (с разделителями),
// либо «<число> <месяц>» в начале cell (ЭлЖур-style — «29 мар»). Это отсекает
// упоминания месяцев в теме урока («19 октября» в названии стихотворения).
const STRICT_DATE_RE = /^\s*\d{2}[./-]\d{2}[./-]\d{2,4}/;
const STRICT_RU_DATE_RE = /^\s*\d{1,2}\s*(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)\b/i;

function rowDateScore(row: string[], gradeStart: number): number {
  // Доля cells (после gradeStart), которые НАЧИНАЮТСЯ с даты.
  let dated = 0;
  let nonempty = 0;
  for (let i = gradeStart; i < row.length; i++) {
    const c = (row[i] ?? "").trim();
    if (!c) continue;
    nonempty++;
    if (STRICT_DATE_RE.test(c) || STRICT_RU_DATE_RE.test(c)) dated++;
  }
  return nonempty === 0 ? 0 : dated / nonempty;
}

function rowTopicScore(row: string[], gradeStart: number): number {
  // Доля cells (после gradeStart), у которых длина > 25 — типичный топик урока.
  let topicy = 0;
  let nonempty = 0;
  for (let i = gradeStart; i < row.length; i++) {
    const c = (row[i] ?? "").trim();
    if (!c) continue;
    nonempty++;
    if (c.length > 25 && !STRICT_DATE_RE.test(c) && !STRICT_RU_DATE_RE.test(c)) topicy++;
  }
  return nonempty === 0 ? 0 : topicy / nonempty;
}

export function findAnchor(rows: string[][]): AnchorResult | null {
  for (let i = 0; i < rows.length; i++) {
    const cand = isCandidateAnchorRow(rows[i]);
    if (cand) {
      // Шапка таблицы — последние 1-3 строки выше anchor с непустыми ячейками после
      // studentColumn. Считаем «оценку как date-row» / «оценку как topic-row» —
      // строка где >50% cells начинаются с даты → date-row; строка где >50% cells
      // длинные не-датные → topic-row. Это исключает ложное срабатывание на «19
      // октября» в названии стихотворения (тема, не дата).
      let dateRow: number | null = null;
      let topicRow: number | null = null;
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        const row = rows[j];
        const dateScore = rowDateScore(row, cand.gradeStart);
        const topicScore = rowTopicScore(row, cand.gradeStart);
        if (dateScore >= 0.5 && dateRow === null) dateRow = j;
        else if (topicScore >= 0.5 && topicRow === null) topicRow = j;
        else if (dateScore < 0.2 && topicScore < 0.2) break;  // пустые/мета строки → стоп
      }
      // если topicRow выше dateRow — темы обычно ниже дат, swap
      if (dateRow !== null && topicRow !== null && topicRow < dateRow) {
        const swap = topicRow; topicRow = dateRow; dateRow = swap;
      }
      return {
        rowIndex: i,
        studentColumn: cand.studentCol,
        gradeStartColumn: cand.gradeStart,
        topicRowIndex: topicRow,
        dateRowIndex: dateRow,
      };
    }
  }
  return null;
}

// ===========================================================================
// Column schema: dates, work types, lesson topics, totals
// ===========================================================================

const DATE_FORMATS: { re: RegExp; toIso: (m: RegExpMatchArray, defYear?: number) => string | undefined }[] = [
  { re: /^(\d{2})[./-](\d{2})[./-](\d{4})$/, toIso: (m) => `${m[3]}-${m[2]}-${m[1]}` },
  { re: /^(\d{2})[./-](\d{2})[./-](\d{2})$/, toIso: (m) => {
      const yy = parseInt(m[3], 10);
      const yyyy = yy < 50 ? 2000 + yy : 1900 + yy;
      return `${yyyy}-${m[2]}-${m[1]}`;
    } },
  { re: /^(\d{1,2})\s*(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)/i, toIso: (m, defYear) => {
      const mon: Record<string, string> = { "янв":"01","фев":"02","мар":"03","апр":"04","мая":"05","июн":"06","июл":"07","авг":"08","сен":"09","окт":"10","ноя":"11","дек":"12" };
      const mm = mon[m[2].toLowerCase().slice(0,3)];
      const dd = m[1].padStart(2, "0");
      const yy = defYear ?? new Date().getFullYear();
      return `${yy}-${mm}-${dd}`;
    } },
];

function tryParseDate(cell: string, defaultYear?: number): string | undefined {
  const lines = cell.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    for (const f of DATE_FORMATS) {
      const m = t.match(f.re);
      if (m) return f.toIso(m, defaultYear);
    }
  }
  return undefined;
}

function tryParseWorkType(cell: string): string | undefined {
  // ищем подстроку в скобках или на отдельной строке: «(Т)», «(КР)», «(КС)», «(ЧН)», «(ПР)», «(СР)», «(ДЗ)», «(МОЙ)»
  const m = cell.match(/[(\[]([А-ЯA-Z]{1,4})[)\]]/);
  if (m) return m[1].toUpperCase();
  // одна-две буквы в верхнем регистре отдельной строкой (ЭлЖур-стиль)
  const lines = cell.split(/\r?\n/).map((l) => l.trim());
  for (const l of lines) {
    if (/^[А-ЯA-Z]{1,4}$/.test(l)) return l.toUpperCase();
  }
  return undefined;
}

const TOTAL_HEADER_RE = /(средн[ие][й]?|за\s+(I|II|III|IV|\d)|итог|годов|четвер|полугоди|триместр|год)/i;

function parseColumnSchema(
  rows: string[][],
  anchor: AnchorResult,
  metadata: ParsedMetadata | null
): ColumnSchema[] {
  const widest = Math.max(...rows.slice(anchor.rowIndex).map((r) => r.length));
  const cols: ColumnSchema[] = [];
  const dateRow = anchor.dateRowIndex !== null ? rows[anchor.dateRowIndex] : null;
  const topicRow = anchor.topicRowIndex !== null ? rows[anchor.topicRowIndex] : null;
  const defaultYear = metadata?.academic_year
    ? parseInt(metadata.academic_year.split("-")[0], 10) // первый год учебного года
    : undefined;

  for (let c = anchor.gradeStartColumn; c < widest; c++) {
    const dateCell = dateRow?.[c] ?? "";
    const topicCell = topicRow?.[c] ?? "";
    const headerCombined = `${dateCell} ${topicCell}`;
    const date = tryParseDate(dateCell, defaultYear);
    const work_type = tryParseWorkType(dateCell) ?? tryParseWorkType(topicCell);
    const isTotal = !date && (TOTAL_HEADER_RE.test(dateCell) || TOTAL_HEADER_RE.test(topicCell));
    cols.push({
      index: c,
      date,
      work_type,
      lesson_topic: topicCell.trim() || undefined,
      is_total: isTotal,
      raw_header: headerCombined.trim(),
    });
  }
  // Авто-смещение года: если у нас в шапке есть и ноябрь-декабрь, и январь-март, и
  // указан учебный год X-Y, ноя/дек получают X, янв/мар получают Y.
  if (defaultYear && metadata?.academic_year) {
    const years = metadata.academic_year.split("-").map((y) => parseInt(y, 10));
    const startYear = years[0];
    const endYear = years[1] ?? startYear + 1;
    for (const col of cols) {
      if (!col.date) continue;
      const d = col.date;
      const month = parseInt(d.slice(5, 7), 10);
      // первая половина учебного года: сен..дек → startYear; вторая: янв..авг → endYear
      const expectedYear = month >= 9 ? startYear : endYear;
      if (parseInt(d.slice(0, 4), 10) !== expectedYear) {
        col.date = `${expectedYear}${d.slice(4)}`;
      }
    }
  }
  return cols;
}

// ===========================================================================
// Body parsing
// ===========================================================================

function parseBody(rows: string[][], anchor: AnchorResult, columns: ColumnSchema[]): GradeEntry[] {
  const entries: GradeEntry[] = [];
  const colByIdx = new Map<number, ColumnSchema>();
  for (const c of columns) colByIdx.set(c.index, c);

  for (let r = anchor.rowIndex; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 0 || row.every((c) => !c.trim())) continue;
    const studentRaw = (row[anchor.studentColumn] ?? "").trim().replace(/^"|"$/g, "");
    if (!looksLikeStudentName(studentRaw)) continue;

    const grades: DatedGrade[] = [];
    let absences = 0;
    let illnesses = 0;
    let notAtt = 0;
    let anyCellSeen = false;

    for (let c = anchor.gradeStartColumn; c < row.length; c++) {
      const colSchema = colByIdx.get(c);
      if (colSchema?.is_total) continue;
      const k = classifyCell(row[c] ?? "");
      if (k.kind === "empty") continue;
      anyCellSeen = true;
      if (k.kind === "grade" && typeof k.value === "number") {
        grades.push({
          value: k.value,
          date: colSchema?.date,
          work_type: colSchema?.work_type,
          lesson_topic: colSchema?.lesson_topic,
        });
      } else if (k.kind === "absence") absences++;
      else if (k.kind === "illness") illnesses++;
      else if (k.kind === "not_attested") notAtt++;
    }

    const not_attested = grades.length === 0 && (absences + illnesses + notAtt > 0 || !anyCellSeen);
    entries.push({
      student: studentRaw,
      grades,
      absences,
      illnesses,
      not_attested,
    });
  }
  return entries;
}

// ===========================================================================
// JSON / simple-CSV legacy paths
// ===========================================================================

export function parseJsonContent(content: string): ParseResult {
  const data = JSON.parse(content);
  const entries: GradeEntry[] = Array.isArray(data)
    ? data.map((it: { student?: string; name?: string; grades?: unknown[] }) => {
        const grades = (it.grades || [])
          .map((g) => (typeof g === "number" ? g : parseInt(String(g), 10)))
          .filter((g): g is number => !Number.isNaN(g) && g >= 2 && g <= 5)
          .map((value): DatedGrade => ({ value }));
        return {
          student: it.student || it.name || "Неизвестный",
          grades,
          absences: 0,
          illnesses: 0,
          not_attested: false,
        };
      })
    : [];
  return { entries, metadata: null, columns: [], delimiter: "json", format_hint: "json", warnings: [] };
}

function parseSimpleCsv(rows: string[][], delimiter: string): ParseResult {
  if (rows.length < 2) {
    return { entries: [], metadata: null, columns: [], delimiter, format_hint: "simple", warnings: [] };
  }
  const entries: GradeEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0) continue;
    const student = (row[0] ?? "").trim().replace(/^"|"$/g, "");
    if (!student) continue;
    const grades: DatedGrade[] = [];
    let absences = 0;
    let illnesses = 0;
    let notAtt = 0;
    for (let c = 1; c < row.length; c++) {
      const k = classifyCell(row[c] ?? "");
      if (k.kind === "grade" && typeof k.value === "number") grades.push({ value: k.value });
      else if (k.kind === "absence") absences++;
      else if (k.kind === "illness") illnesses++;
      else if (k.kind === "not_attested") notAtt++;
    }
    if (grades.length === 0 && absences + illnesses + notAtt === 0) continue;
    entries.push({
      student,
      grades,
      absences,
      illnesses,
      not_attested: grades.length === 0,
    });
  }
  return { entries, metadata: null, columns: [], delimiter, format_hint: "simple", warnings: [] };
}

// ===========================================================================
// Main parser
// ===========================================================================

export function parseGradesText(text: string, hint: "csv" | "tsv" | "json" = "csv"): ParseResult {
  if (hint === "json") return parseJsonContent(text);
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) {
    return { entries: [], metadata: null, columns: [], delimiter, format_hint: "empty", warnings: ["файл пуст"] };
  }
  const anchor = findAnchor(rows);
  if (!anchor) return parseSimpleCsv(rows, delimiter);
  const headerRows = rows.slice(0, anchor.rowIndex);
  const metadata = extractMetadata(headerRows);
  const columns = parseColumnSchema(rows, anchor, metadata);
  const entries = parseBody(rows, anchor, columns);
  return {
    entries,
    metadata,
    columns,
    delimiter,
    format_hint: headerRows.length >= 2 ? "rich-export" : "simple",
    warnings: [],
  };
}

export function parseGradesBuffer(buf: Buffer, ext: string): ParseResult {
  const lower = ext.toLowerCase();
  if (lower === ".xlsx" || lower === ".xls") {
    const rows = parseXlsx(buf);
    if (rows.length === 0) {
      return { entries: [], metadata: null, columns: [], delimiter: "xlsx", format_hint: "xlsx-empty", warnings: ["лист пуст"] };
    }
    const anchor = findAnchor(rows);
    if (!anchor) {
      // Простая интерпретация XLSX-листа как plain table
      return parseSimpleCsv(rows, "xlsx");
    }
    const headerRows = rows.slice(0, anchor.rowIndex);
    const metadata = extractMetadata(headerRows);
    const columns = parseColumnSchema(rows, anchor, metadata);
    const entries = parseBody(rows, anchor, columns);
    return {
      entries,
      metadata,
      columns,
      delimiter: "xlsx",
      format_hint: "xlsx",
      warnings: [],
    };
  }
  if (lower === ".json") {
    const { text } = decodeBuffer(buf);
    return parseJsonContent(text);
  }
  // CSV / TSV
  const { text, encoding } = decodeBuffer(buf);
  const result = parseGradesText(text, lower === ".tsv" ? "tsv" : "csv");
  if (encoding !== "utf-8") result.warnings.push(`декодировано как ${encoding}`);
  return result;
}

// ===========================================================================
// Period helpers
// ===========================================================================

const RU_QUARTER_RANGES: Record<string, [string, string]> = {
  // приблизительные диапазоны по российскому учебному календарю; уточняются academicYearStart
  q1: ["09-01", "10-31"],
  q2: ["11-01", "12-31"],
  q3: ["01-09", "03-21"],
  q4: ["04-01", "05-31"],
  semester1: ["09-01", "12-31"],
  semester2: ["01-09", "05-31"],
  year: ["09-01", "06-15"],
};

function resolvePeriodRange(period: string | undefined, academicYear?: string): { from?: string; to?: string } {
  if (!period) return {};
  const range = RU_QUARTER_RANGES[period];
  if (!range) return {};
  const [startMd, endMd] = range;
  const startMonth = parseInt(startMd.slice(0, 2), 10);
  const endMonth = parseInt(endMd.slice(0, 2), 10);
  const ay = academicYear?.split("-").map((y) => parseInt(y, 10));
  const startYear = ay?.[0] ?? new Date().getFullYear();
  const endYear = ay?.[1] ?? startYear + 1;
  const fromYear = startMonth >= 9 ? startYear : endYear;
  const toYear = endMonth >= 9 ? startYear : endYear;
  return { from: `${fromYear}-${startMd}`, to: `${toYear}-${endMd}` };
}

function gradeMatchesFilter(g: DatedGrade, opts: {
  date_from?: string; date_to?: string; work_types?: string[];
}): boolean {
  if (opts.date_from && g.date && g.date < opts.date_from) return false;
  if (opts.date_to && g.date && g.date > opts.date_to) return false;
  if (opts.work_types && opts.work_types.length > 0) {
    if (!g.work_type) return false;
    if (!opts.work_types.includes(g.work_type)) return false;
  }
  // если фильтр требует период, а у оценки нет даты — мы не можем гарантировать,
  // что она в периоде; пропускаем (аккуратнее «too few» чем «too many»).
  if ((opts.date_from || opts.date_to) && !g.date) return false;
  return true;
}

// ===========================================================================
// Statistics
// ===========================================================================

export function calculateAverage(grades: number[]): number {
  if (grades.length === 0) return 0;
  return Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100;
}

// ===========================================================================
// Anonymization
// ===========================================================================

interface AnonymizedEntry extends Omit<GradeEntry, "student"> {
  student: string;            // псевдоним «Ученик #N»
  real_name?: string;         // только если anonymize=false
}

function anonymizeEntries(entries: GradeEntry[], anonymize: boolean): {
  entries: AnonymizedEntry[];
  name_map: Record<string, string>;       // pseudo → real
  reverse_map: Record<string, string>;    // real → pseudo
} {
  const name_map: Record<string, string> = {};
  const reverse_map: Record<string, string> = {};
  const out: AnonymizedEntry[] = entries.map((e, i) => {
    const pseudo = `Ученик #${i + 1}`;
    name_map[pseudo] = e.student;
    reverse_map[e.student] = pseudo;
    if (anonymize) {
      return { ...e, student: pseudo };
    }
    return { ...e, student: e.student, real_name: e.student };
  });
  return { entries: out, name_map, reverse_map };
}

// ===========================================================================
// MCP tool registration
// ===========================================================================

export function registerGradeAnalyticsTool(server: McpServer): void {
  server.tool(
    "grade_analytics",
    "Статистический анализ оценок класса с фильтрами по периоду, датам и типам работ. " +
    "Поддерживает реальные экспорты МЭШ/Дневник.ру/Сетевого Города/ЭлЖур (CSV с шапкой, " +
    "обозначениями Н/Б/н/а, multi-line cells, кодировки UTF-8/UTF-8-BOM/Windows-1251), " +
    "XLSX, простой CSV `ФИО,оценка1,...` и JSON `[{student, grades}]`. " +
    "По умолчанию анонимизирует ФИО (возвращает «Ученик #N» + name_map отдельным полем) — " +
    "это нужно, чтобы реальные имена не попадали в LLM-промпт. Скилл, если ему нужны " +
    "реальные имена для локального файла-отчёта, вызывает с anonymize=false.",
    {
      data_path: z.string().describe("Путь к файлу с оценками (CSV/TSV/XLSX/JSON)"),
      metrics: z
        .array(z.enum(["average", "quality", "success_rate", "distribution", "students_at_risk", "top_students", "attendance"]))
        .optional()
        .describe("Метрики (по умолчанию все). attendance считает Н/Б."),
      period: z
        .enum(["q1", "q2", "q3", "q4", "semester1", "semester2", "year"])
        .optional()
        .describe("Учебный период; разрешается в диапазон дат с учётом academic_year из шапки файла."),
      date_from: z.string().optional().describe("ISO дата начала диапазона (YYYY-MM-DD), переопределяет period."),
      date_to: z.string().optional().describe("ISO дата конца диапазона (YYYY-MM-DD), переопределяет period."),
      work_type: z.array(z.string()).optional().describe("Типы работ для фильтра: Т, КР, СР, ПР, КС, ЧН, ДЗ, МОЙ. Без фильтра — все."),
      anonymize: z.boolean().optional().describe("Анонимизировать ФИО в основном выводе (по умолчанию true). name_map возвращается отдельным полем."),
    },
    async ({ data_path, metrics, period, date_from, date_to, work_type, anonymize }) => {
      if (!existsSync(data_path)) {
        return { content: [{ type: "text" as const, text: `Ошибка: файл "${data_path}" не найден.` }] };
      }
      const buf = await readFile(data_path);
      const ext = data_path.toLowerCase().match(/\.[^./\\]+$/)?.[0] ?? ".csv";
      let parsed: ParseResult;
      try {
        parsed = parseGradesBuffer(buf, ext);
      } catch (e) {
        return {
          content: [{
            type: "text" as const,
            text: `Ошибка при чтении файла: ${e instanceof Error ? e.message : String(e)}\n` +
                  `Поддерживаемые форматы: CSV/TSV (auto-detect ; , \\t; кодировки UTF-8/BOM/Windows-1251), XLSX, простой CSV \`ФИО,оценка1,...\`, JSON \`[{student, grades}]\`.`,
          }],
        };
      }
      if (parsed.entries.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: `Не удалось распознать данные об оценках в файле "${data_path}".\n` +
                  `Разделитель: "${parsed.delimiter}"; формат: ${parsed.format_hint}.\n` +
                  `Предупреждения: ${parsed.warnings.join(", ") || "(нет)"}\n` +
                  `Подсказки:\n` +
                  `  • Файл должен содержать строку с ФИО и хотя бы 2 оценками (2-5).\n` +
                  `  • Для экспорта МЭШ/Дневник.ру/ЭлЖур: убедитесь, что шапка над таблицей и сама таблица учеников целые.\n` +
                  `  • Альтернатива: упрощённый формат \`ФИО,оценка1,оценка2,...\` (UTF-8).`,
          }],
        };
      }

      // ----- Filter grades by period / dates / work_type --------------------
      const isAnon = anonymize !== false;
      const range = (date_from || date_to)
        ? { from: date_from, to: date_to }
        : resolvePeriodRange(period, parsed.metadata?.academic_year);
      const wtList = work_type && work_type.length > 0 ? work_type.map((w) => w.toUpperCase()) : undefined;

      const filteredEntries: GradeEntry[] = parsed.entries.map((e) => ({
        ...e,
        grades: e.grades.filter((g) => gradeMatchesFilter(g, {
          date_from: range.from, date_to: range.to, work_types: wtList,
        })),
      }));

      // ----- Anonymization --------------------------------------------------
      const anon = anonymizeEntries(filteredEntries, isAnon);
      const studentAverages = anon.entries.map((e) => ({
        student: e.student,
        average: calculateAverage(e.grades.map((g) => g.value)),
        count: e.grades.length,
        not_attested: e.grades.length === 0 && filteredEntries.find((x, i) => `Ученик #${i + 1}` === e.student || x.student === e.student)?.not_attested === true,
        absences: e.absences,
        illnesses: e.illnesses,
      }));
      const allGradeValues = filteredEntries.flatMap((e) => e.grades.map((g) => g.value));

      const allMetrics = metrics || ["average", "quality", "success_rate", "distribution", "students_at_risk", "top_students", "attendance"];

      const result: Record<string, unknown> = {
        total_students: filteredEntries.length,
        total_grades: allGradeValues.length,
        format: { delimiter: parsed.delimiter, hint: parsed.format_hint },
        filters: {
          period: period ?? null,
          date_from: range.from ?? null,
          date_to: range.to ?? null,
          work_types: wtList ?? null,
          anonymize: isAnon,
        },
      };
      if (parsed.metadata) result.metadata = parsed.metadata;
      if (parsed.warnings.length > 0) result.warnings = parsed.warnings;

      const attestedAvgs = studentAverages.filter((s) => !s.not_attested && s.count > 0);

      if (allMetrics.includes("average")) {
        result.average = {
          class_average: calculateAverage(allGradeValues),
          per_student: studentAverages.map((s) => ({
            student: s.student,
            average: s.count === 0 ? null : s.average,
            grade_count: s.count,
            not_attested: s.not_attested,
          })),
        };
      }
      if (allMetrics.includes("quality")) {
        const qualityCount = attestedAvgs.filter((s) => s.average >= 3.5).length;
        const denom = attestedAvgs.length || 1;
        result.quality = {
          percentage: Math.round((qualityCount / denom) * 100),
          description: `${qualityCount} из ${attestedAvgs.length} аттестованных учатся на 4 и 5`,
          excluded_not_attested: studentAverages.length - attestedAvgs.length,
        };
      }
      if (allMetrics.includes("success_rate")) {
        const successCount = attestedAvgs.filter((s) => s.average >= 2.5).length;
        const denom = attestedAvgs.length || 1;
        result.success_rate = {
          percentage: Math.round((successCount / denom) * 100),
          description: `${successCount} из ${attestedAvgs.length} аттестованных успевают (без двоек)`,
          excluded_not_attested: studentAverages.length - attestedAvgs.length,
        };
      }
      if (allMetrics.includes("distribution")) {
        const dist: Record<string, number> = { "5": 0, "4": 0, "3": 0, "2": 0 };
        for (const g of allGradeValues) {
          if (g >= 5) dist["5"]++;
          else if (g >= 4) dist["4"]++;
          else if (g >= 3) dist["3"]++;
          else dist["2"]++;
        }
        result.distribution = dist;
      }
      if (allMetrics.includes("students_at_risk")) {
        const lowAvg = attestedAvgs
          .filter((s) => s.average < 3.0)
          .map((s) => ({
            student: s.student,
            average: s.average,
            grade_count: s.count,
            reason: "low_average",
            recommendation: "Дополнительная индивидуальная работа, дифференцированные задания базового уровня.",
          }));
        const notAttested = studentAverages
          .filter((s) => s.not_attested)
          .map((s) => ({
            student: s.student,
            average: null,
            grade_count: 0,
            absences: s.absences,
            illnesses: s.illnesses,
            reason: "not_attested",
            recommendation: "Не аттестован — выяснить причины пропусков, организовать индивидуальную аттестацию.",
          }));
        result.students_at_risk = [...notAttested, ...lowAvg];
      }
      if (allMetrics.includes("top_students")) {
        result.top_students = attestedAvgs
          .filter((s) => s.average >= 4.5)
          .sort((a, b) => b.average - a.average)
          .map((s) => ({
            student: s.student,
            average: s.average,
            grade_count: s.count,
            recommendation: "Олимпиады, индивидуальные исследовательские проекты, роль наставника.",
          }));
      }
      if (allMetrics.includes("attendance")) {
        const totalAbsences = filteredEntries.reduce((acc, e) => acc + e.absences, 0);
        const totalIllnesses = filteredEntries.reduce((acc, e) => acc + e.illnesses, 0);
        result.attendance = {
          total_absences: totalAbsences,
          total_illnesses: totalIllnesses,
          students_with_absences: filteredEntries
            .map((e, i) => ({
              student: isAnon ? `Ученик #${i + 1}` : e.student,
              absences: e.absences,
              illnesses: e.illnesses,
            }))
            .filter((s) => s.absences + s.illnesses > 0),
        };
      }
      if (isAnon) {
        result.name_map_note = "ФИО анонимизированы. Маппинг pseudonym → real_name возвращается в name_map; используй его только локально, не передавай в LLM.";
        result.name_map = anon.name_map;
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}
