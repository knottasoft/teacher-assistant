/**
 * Общий доступ к данным ФРП через SQLite (better-sqlite3 + sqlite-vec).
 *
 * База fgos.db собирается через scripts/build-fgos-db.mjs и кладётся в
 * mcp-server/data/fgos.db. Старые JSON-файлы в src/data/fgos/*.json остаются
 * как источник для билд-скрипта (single source of truth для контента).
 *
 * Соединение с БД ленивое (открывается при первом обращении). Для тестов
 * можно переопределить путь через TEACHER_FGOS_DB env var.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ---- Public types ---------------------------------------------------------

export interface Topic {
  name: string;
  hours: number;
  planned_results: {
    subject: string[];
    meta: string[];
    personal: string[];
  };
  uud: {
    cognitive: string[];
    regulative: string[];
    communicative: string[];
    personal: string[];
  };
  control_types: string[];
}

export interface Section {
  name: string;
  hours: number;
  topics: Topic[];
}

export interface GradeData {
  level: string;
  hours_per_week: number;
  total_hours_per_year: number;
  sections: Section[];
  control_works: Record<string, unknown>;
  source_note?: string;
}

export interface FgosData {
  subject: string;
  subject_id: string;
  documents?: Record<string, string>;
  documents_note?: string;
  grades: Record<string, GradeData>;
}

// ---- Subject mapping (sync with build-fgos-db.mjs) ------------------------

export const SUBJECTS = ["russian", "math", "physics", "literature"] as const;

export const SUBJECT_NAMES: Record<string, string> = {
  russian: "Русский язык",
  math: "Математика",
  physics: "Физика",
  literature: "Литература",
};

export const SUBJECT_ALIASES: Record<string, string> = {
  "русский": "russian",
  "русский язык": "russian",
  "математика": "math",
  "алгебра": "math",
  "геометрия": "math",
  "физика": "physics",
  "литература": "literature",
};

export function resolveSubject(input: string): string {
  const lower = input.toLowerCase().trim();
  return SUBJECT_ALIASES[lower] || lower;
}

// ---- Database connection (lazy) -------------------------------------------

let _db: Database.Database | null = null;
let _vecLoaded = false;

function resolveDbPath(): string {
  const fromEnv = process.env.TEACHER_FGOS_DB;
  if (fromEnv) return fromEnv;

  // dist/index.js → ../../data/fgos.db
  // src/data/shared.ts (during tests) → ../../../data/fgos.db (relative to mcp-server/)
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../data/fgos.db"),       // from dist/...
    resolve(here, "../../../data/fgos.db"),    // from src/data/ during tests
    resolve(process.cwd(), "mcp-server/data/fgos.db"),
    resolve(process.cwd(), "data/fgos.db"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `fgos.db not found. Run: node scripts/build-fgos-db.mjs\n` +
    `Looked in:\n  ${candidates.join("\n  ")}`
  );
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const path = resolveDbPath();
  _db = new Database(path, { readonly: true, fileMustExist: true });
  _db.pragma("query_only = true");
  return _db;
}

/**
 * Lazy-loads sqlite-vec extension. Returns true on success, false if extension
 * unavailable (e.g. binary missing for current platform). Caller should
 * gracefully degrade to FTS5-only search when this returns false.
 */
export function ensureVecLoaded(): boolean {
  if (_vecLoaded) return true;
  try {
    const db = getDb();
    // sqlite-vec.load() requires non-readonly db for extension load,
    // so we re-open temporarily.
    db.close();
    _db = null;
    const path = resolveDbPath();
    _db = new Database(path, { fileMustExist: true });
    sqliteVec.load(_db);
    // Re-apply read-only behaviour at app level
    _db.pragma("query_only = true");
    _vecLoaded = true;
    return true;
  } catch (err) {
    console.error("[shared] sqlite-vec load failed:", (err as Error).message);
    return false;
  }
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _vecLoaded = false;
  }
}

// ---- Domain queries -------------------------------------------------------

export function listSubjects(): { id: string; name: string }[] {
  return getDb()
    .prepare("SELECT id, name FROM subjects ORDER BY id")
    .all() as { id: string; name: string }[];
}

export function getDocuments(subjectId: string): { doc_key: string; description: string }[] {
  return getDb()
    .prepare("SELECT doc_key, description FROM documents WHERE subject_id = ? ORDER BY id")
    .all(subjectId) as { doc_key: string; description: string }[];
}

export function getGradeData(subjectId: string, grade: number): GradeData | null {
  const db = getDb();
  const gradeRow = db.prepare(`
    SELECT id, level, hours_per_week, total_hours_per_year, source_note, control_works_json
    FROM grades WHERE subject_id = ? AND grade = ?
  `).get(subjectId, grade) as
    | {
        id: number;
        level: string;
        hours_per_week: number;
        total_hours_per_year: number;
        source_note: string | null;
        control_works_json: string;
      }
    | undefined;
  if (!gradeRow) return null;

  const sections = db.prepare(`
    SELECT id, name, hours FROM sections WHERE grade_id = ? ORDER BY position
  `).all(gradeRow.id) as { id: number; name: string; hours: number }[];

  const sectionsOut: Section[] = sections.map((sec) => ({
    name: sec.name,
    hours: sec.hours,
    topics: getTopicsForSection(sec.id),
  }));

  return {
    level: gradeRow.level,
    hours_per_week: gradeRow.hours_per_week,
    total_hours_per_year: gradeRow.total_hours_per_year,
    sections: sectionsOut,
    control_works: JSON.parse(gradeRow.control_works_json || "{}"),
    source_note: gradeRow.source_note ?? undefined,
  };
}

function getTopicsForSection(sectionId: number): Topic[] {
  const db = getDb();
  const topics = db.prepare(`
    SELECT id, name, hours, control_types_json
    FROM topics WHERE section_id = ? ORDER BY position
  `).all(sectionId) as
    | { id: number; name: string; hours: number; control_types_json: string }[];

  return topics.map((t) => {
    const planned_results = {
      subject: getResultStrings(t.id, "planned_results", "subject"),
      meta: getResultStrings(t.id, "planned_results", "meta"),
      personal: getResultStrings(t.id, "planned_results", "personal"),
    };
    const uud = {
      cognitive: getResultStrings(t.id, "uud", "cognitive"),
      regulative: getResultStrings(t.id, "uud", "regulative"),
      communicative: getResultStrings(t.id, "uud", "communicative"),
      personal: getResultStrings(t.id, "uud", "personal"),
    };
    return {
      name: t.name,
      hours: t.hours,
      planned_results,
      uud,
      control_types: JSON.parse(t.control_types_json || "[]"),
    };
  });
}

function getResultStrings(topicId: number, table: "planned_results" | "uud", kind: string): string[] {
  const sql = `SELECT text FROM ${table} WHERE topic_id = ? AND kind = ? ORDER BY position`;
  const rows = getDb().prepare(sql).all(topicId, kind) as { text: string }[];
  return rows.map((r) => r.text);
}

/**
 * Возвращает полный объект FgosData для предмета (как раньше из JSON).
 * Совместимость с прежним кодом, использующим FGOS_DATA[subject_id].
 */
export function getFgosData(subjectId: string): FgosData | null {
  const db = getDb();
  const subj = db
    .prepare("SELECT id, name, standard_ooo, standard_soo, documents_note FROM subjects WHERE id = ?")
    .get(subjectId) as
    | { id: string; name: string; standard_ooo: string | null; standard_soo: string | null; documents_note: string | null }
    | undefined;
  if (!subj) return null;

  const docs = getDocuments(subjectId);
  const documents: Record<string, string> = {};
  for (const d of docs) documents[d.doc_key] = d.description;

  const grades: Record<string, GradeData> = {};
  const gradeNums = db
    .prepare("SELECT grade FROM grades WHERE subject_id = ? ORDER BY grade")
    .all(subjectId) as { grade: number }[];
  for (const { grade } of gradeNums) {
    const gd = getGradeData(subjectId, grade);
    if (gd) grades[String(grade)] = gd;
  }

  return {
    subject: subj.name,
    subject_id: subj.id,
    documents,
    documents_note: subj.documents_note ?? undefined,
    grades,
  };
}
