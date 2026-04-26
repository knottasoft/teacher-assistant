#!/usr/bin/env node
/**
 * Build script: JSON ФРП-данные → SQLite база + FTS5 + sqlite-vec embeddings.
 *
 * Источники: mcp-server/src/data/fgos/{russian,math,physics,literature}.json
 * Выход:     mcp-server/data/fgos.db (single file, ~10-15 MB)
 *
 * Использование:
 *   node scripts/build-fgos-db.mjs           # полная пересборка
 *   node scripts/build-fgos-db.mjs --no-vec  # без embeddings (быстрее)
 *
 * Note: использует better-sqlite3 db.exec() — это SQLite API для multi-statement
 * SQL, никакого отношения к child_process/shell не имеет.
 */

import { readFileSync, mkdirSync, existsSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "mcp-server", "src", "data", "fgos");
const SCHEMA_PATH = join(REPO_ROOT, "mcp-server", "src", "db", "schema.sql");
const OUTPUT_DIR = join(REPO_ROOT, "mcp-server", "data");
const OUTPUT_DB = join(OUTPUT_DIR, "fgos.db");

const SUBJECTS = ["russian", "math", "physics", "literature"];
const SCHEMA_VERSION = "1";
const EMBEDDING_MODEL = "Xenova/multilingual-e5-base";
const EMBEDDING_DIM = 768;

const args = new Set(process.argv.slice(2));
const SKIP_VEC = args.has("--no-vec");

function log(msg) { console.log(msg); }

mkdirSync(OUTPUT_DIR, { recursive: true });
if (existsSync(OUTPUT_DB)) {
  log(`→ Удаляю старую базу: ${OUTPUT_DB}`);
  rmSync(OUTPUT_DB);
}

log(`→ Создаю базу: ${OUTPUT_DB}`);
const db = new Database(OUTPUT_DB);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = readFileSync(SCHEMA_PATH, "utf-8");
db.exec(schema);

// ---- Inserts ---------------------------------------------------------------

const insertSubject = db.prepare(`INSERT INTO subjects(id, name, standard_ooo, standard_soo, documents_note) VALUES (?, ?, ?, ?, ?)`);
const insertDocument = db.prepare(`INSERT INTO documents(subject_id, doc_key, description) VALUES (?, ?, ?)`);
const insertGrade = db.prepare(`INSERT INTO grades(subject_id, grade, level, hours_per_week, total_hours_per_year, source_note, control_works_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertSection = db.prepare(`INSERT INTO sections(grade_id, position, name, hours) VALUES (?, ?, ?, ?)`);
const insertTopic = db.prepare(`INSERT INTO topics(section_id, position, name, hours, control_types_json) VALUES (?, ?, ?, ?, ?)`);
const insertPlannedResult = db.prepare(`INSERT INTO planned_results(topic_id, kind, position, text) VALUES (?, ?, ?, ?)`);
const insertUud = db.prepare(`INSERT INTO uud(topic_id, kind, position, text) VALUES (?, ?, ?, ?)`);
const insertSearchIdx = db.prepare(`INSERT INTO topic_search_index(topic_id, subject, grade, section, topic, full_text) VALUES (?, ?, ?, ?, ?, ?)`);

let totals = { subjects: 0, grades: 0, sections: 0, topics: 0 };

const importAll = db.transaction(() => {
  for (const subjectId of SUBJECTS) {
    const filePath = join(DATA_DIR, `${subjectId}.json`);
    log(`→ ${subjectId}.json`);
    const data = JSON.parse(readFileSync(filePath, "utf-8"));

    insertSubject.run(data.subject_id, data.subject, data.standard_ooo ?? null, data.standard_soo ?? null, data.documents_note ?? null);
    totals.subjects++;

    if (data.documents) {
      for (const [key, desc] of Object.entries(data.documents)) {
        insertDocument.run(data.subject_id, key, desc);
      }
    }

    for (const [gradeStr, gradeData] of Object.entries(data.grades)) {
      const grade = Number(gradeStr);
      const gradeRow = insertGrade.run(
        data.subject_id, grade, gradeData.level,
        gradeData.hours_per_week, gradeData.total_hours_per_year,
        gradeData.source_note ?? null,
        JSON.stringify(gradeData.control_works ?? {})
      );
      const gradeId = gradeRow.lastInsertRowid;
      totals.grades++;

      let sectionPos = 0;
      for (const section of gradeData.sections) {
        sectionPos++;
        const sectionRow = insertSection.run(gradeId, sectionPos, section.name, section.hours);
        const sectionId = sectionRow.lastInsertRowid;
        totals.sections++;

        let topicPos = 0;
        for (const topic of section.topics) {
          topicPos++;
          const topicRow = insertTopic.run(sectionId, topicPos, topic.name, topic.hours, JSON.stringify(topic.control_types ?? []));
          const topicId = topicRow.lastInsertRowid;
          totals.topics++;

          for (const kind of ["subject", "meta", "personal"]) {
            const items = topic.planned_results?.[kind] ?? [];
            items.forEach((text, i) => insertPlannedResult.run(topicId, kind, i, text));
          }
          for (const kind of ["cognitive", "regulative", "communicative", "personal"]) {
            const items = topic.uud?.[kind] ?? [];
            items.forEach((text, i) => insertUud.run(topicId, kind, i, text));
          }

          const aggregated = [
            topic.name,
            ...((topic.planned_results?.subject) ?? []),
            ...((topic.planned_results?.meta) ?? []),
            ...((topic.planned_results?.personal) ?? []),
            ...((topic.uud?.cognitive) ?? []),
            ...((topic.uud?.regulative) ?? []),
            ...((topic.uud?.communicative) ?? []),
            ...((topic.uud?.personal) ?? []),
            ...((topic.control_types) ?? []),
          ].join(" • ");

          insertSearchIdx.run(topicId, data.subject, grade, section.name, topic.name, aggregated);
        }
      }
    }
  }
});

importAll();
log(`   loaded: ${totals.subjects} subjects, ${totals.grades} grades, ${totals.sections} sections, ${totals.topics} topics`);

// ---- FTS5 ------------------------------------------------------------------

log("→ Заполняю FTS5 (topic_search)");
db.exec(`INSERT INTO topic_search(rowid, subject, grade, section, topic, full_text)
         SELECT topic_id, subject, grade, section, topic, full_text FROM topic_search_index;`);
const ftsCount = db.prepare("SELECT COUNT(*) AS n FROM topic_search").get();
log(`   indexed: ${ftsCount.n} topics`);

// ---- Meta ------------------------------------------------------------------

const setMeta = db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)");
setMeta.run("schema_version", SCHEMA_VERSION);
setMeta.run("generated_at", new Date().toISOString());
setMeta.run("source_frp_version", "FRP-2025 (Минпросвещения России, ИСМО им. В.С. Леднева)");

// ---- Embeddings (sqlite-vec + transformers.js) -----------------------------

if (SKIP_VEC) {
  log("→ --no-vec: пропускаю embeddings");
} else {
  log("→ Загружаю sqlite-vec расширение");
  sqliteVec.load(db);
  const vecVersion = db.prepare("SELECT vec_version() AS v").get();
  log(`   sqlite-vec version: ${vecVersion.v}`);

  log(`→ Создаю vec-таблицу topic_vec(${EMBEDDING_DIM})`);
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS topic_vec USING vec0(
    topic_id INTEGER PRIMARY KEY,
    embedding FLOAT[${EMBEDDING_DIM}]
  );`);

  log(`→ Загружаю модель ${EMBEDDING_MODEL} (первый раз — скачается ~280 МБ в ~/.cache/huggingface)`);
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline("feature-extraction", EMBEDDING_MODEL, { quantized: true });
  log("   модель загружена");

  const topicsForEmbedding = db.prepare(`
    SELECT t.id AS topic_id, s.name AS subject, g.grade AS grade, sec.name AS section,
           t.name AS topic, tsi.full_text AS full_text
    FROM topics t
    JOIN sections sec ON sec.id = t.section_id
    JOIN grades g ON g.id = sec.grade_id
    JOIN subjects s ON s.id = g.subject_id
    JOIN topic_search_index tsi ON tsi.topic_id = t.id
    ORDER BY t.id
  `).all();

  log(`→ Считаю embeddings для ${topicsForEmbedding.length} тем`);

  const insertVec = db.prepare("INSERT INTO topic_vec(topic_id, embedding) VALUES (?, ?)");
  const insertVecMany = db.transaction((rows) => {
    for (const r of rows) insertVec.run(BigInt(r.topic_id), r.embedding);
  });

  const BATCH = 16;
  const buffer = [];
  let processed = 0;
  for (const row of topicsForEmbedding) {
    const passage = `passage: ${row.subject} | ${row.grade} класс | ${row.section} | ${row.topic}. ${row.full_text}`;
    const output = await extractor(passage, { pooling: "mean", normalize: true });
    const vec = Float32Array.from(output.data);
    if (vec.length !== EMBEDDING_DIM) {
      throw new Error(`Unexpected embedding dim: got ${vec.length}, expected ${EMBEDDING_DIM}`);
    }
    buffer.push({ topic_id: row.topic_id, embedding: Buffer.from(vec.buffer) });
    if (buffer.length >= BATCH) {
      insertVecMany(buffer);
      processed += buffer.length;
      log(`   ... ${processed}/${topicsForEmbedding.length}`);
      buffer.length = 0;
    }
  }
  if (buffer.length) {
    insertVecMany(buffer);
    processed += buffer.length;
  }
  log(`   embeddings: ${processed}`);

  db.prepare(`INSERT INTO embedding_meta(model_name, dimension, generated_at, topic_count)
              VALUES (?, ?, ?, ?)`)
    .run(EMBEDDING_MODEL, EMBEDDING_DIM, new Date().toISOString(), processed);
}

db.exec("VACUUM");
db.close();

const sizeMB = (statSync(OUTPUT_DB).size / 1024 / 1024).toFixed(2);
log(`\n✓ База готова: ${OUTPUT_DB}`);
log(`  размер: ${sizeMB} МБ`);
