/**
 * Гибридный поиск по ФРП: FTS5 + семантический (sqlite-vec + e5-base).
 *
 * Стратегия:
 *   1. FTS5 на агрегированном поисковом тексте (название темы + planned_results
 *      + uud + control_types). Быстро, точно для конкретных терминов.
 *   2. Если задан `semantic: true` (или FTS5 вернул мало результатов и доступен
 *      sqlite-vec) — добавляем семантический поиск через embeddings query.
 *   3. Результаты объединяем по topic_id, ранжируем по score.
 *
 * Embedding модель загружается лениво при первом семантическом запросе.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, ensureVecLoaded, resolveSubject } from "../data/shared.js";

const EMBEDDING_MODEL = "Xenova/multilingual-e5-base";
const EMBEDDING_DIM = 768;

type Extractor = (text: string, opts: { pooling: "mean"; normalize: true }) => Promise<{ data: Float32Array | number[] }>;
let _extractor: Extractor | null = null;
let _extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (_extractor) return _extractor;
  if (!_extractorPromise) {
    _extractorPromise = (async () => {
      // First call downloads the model (~280 MB) to ./node_modules/@xenova/transformers/.cache/
      // Subsequent calls are <2 sec. Inference per query is ~25 ms.
      const mod = await import("@xenova/transformers");
      const ext = (await mod.pipeline("feature-extraction", EMBEDDING_MODEL, {
        quantized: true,
      })) as unknown as Extractor;
      _extractor = ext;
      return ext;
    })();
  }
  return _extractorPromise;
}

interface SearchHit {
  topic_id: number;
  subject: string;
  grade: number;
  section: string;
  topic: string;
  hours: number;
  fts_rank?: number;
  vec_distance?: number;
  combined_score: number;
}

function ftsSearch(query: string, k: number, filterSubject?: string, filterGrade?: number): SearchHit[] {
  const db = getDb();
  // FTS5 с MATCH; экранируем кавычки в запросе пользователя и оборачиваем в "" для безопасности.
  // Если пользователь хочет операторы FTS5 (AND, OR, NEAR, *), можно передать как есть.
  const sanitized = query.replace(/"/g, '""');
  const sql = `
    SELECT t.id AS topic_id, s.name AS subject, g.grade AS grade,
           sec.name AS section, t.name AS topic, t.hours,
           bm25(topic_search) AS rank_score
    FROM topic_search
    JOIN topics t ON t.id = topic_search.rowid
    JOIN sections sec ON sec.id = t.section_id
    JOIN grades g ON g.id = sec.grade_id
    JOIN subjects s ON s.id = g.subject_id
    WHERE topic_search MATCH ?
      ${filterSubject ? "AND s.id = ?" : ""}
      ${filterGrade ? "AND g.grade = ?" : ""}
    ORDER BY rank_score
    LIMIT ?
  `;
  const params: unknown[] = [`"${sanitized}"`];
  if (filterSubject) params.push(filterSubject);
  if (filterGrade) params.push(filterGrade);
  params.push(k);
  try {
    const rows = db.prepare(sql).all(...params) as Array<{
      topic_id: number;
      subject: string;
      grade: number;
      section: string;
      topic: string;
      hours: number;
      rank_score: number;
    }>;
    // BM25 в SQLite возвращает negatives; чем меньше — тем релевантнее. Нормализуем в [0,1].
    return rows.map((r) => ({
      topic_id: r.topic_id,
      subject: r.subject,
      grade: r.grade,
      section: r.section,
      topic: r.topic,
      hours: r.hours,
      fts_rank: r.rank_score,
      combined_score: 1 / (1 + Math.abs(r.rank_score)), // ↑=better
    }));
  } catch {
    // Если в запросе невалидный FTS-синтаксис — возвращаем пусто, чтобы caller
    // мог откатиться на vector-only.
    return [];
  }
}

async function vecSearch(query: string, k: number, filterSubject?: string, filterGrade?: number): Promise<SearchHit[]> {
  if (!ensureVecLoaded()) return [];
  const db = getDb();
  const extractor = await getExtractor();
  const out = await extractor(`query: ${query}`, { pooling: "mean", normalize: true });
  const arr = Float32Array.from(out.data as Float32Array);
  if (arr.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding dim from model: ${arr.length}`);
  }
  const buf = Buffer.from(arr.buffer);

  // sqlite-vec KNN search
  const knnSql = `
    SELECT v.topic_id, v.distance,
           s.name AS subject, g.grade AS grade,
           sec.name AS section, t.name AS topic, t.hours
    FROM (
      SELECT topic_id, distance FROM topic_vec
      WHERE embedding MATCH ? AND k = ?
    ) v
    JOIN topics t ON t.id = v.topic_id
    JOIN sections sec ON sec.id = t.section_id
    JOIN grades g ON g.id = sec.grade_id
    JOIN subjects s ON s.id = g.subject_id
    ${filterSubject || filterGrade ? "WHERE 1=1" : ""}
    ${filterSubject ? "AND s.id = ?" : ""}
    ${filterGrade ? "AND g.grade = ?" : ""}
    ORDER BY v.distance
  `;
  // Берём в 3 раза больше кандидатов, чтобы после фильтра осталось k.
  const candidates = (filterSubject || filterGrade) ? k * 5 : k;
  const params: unknown[] = [buf, candidates];
  if (filterSubject) params.push(filterSubject);
  if (filterGrade) params.push(filterGrade);

  const rows = db.prepare(knnSql).all(...params) as Array<{
    topic_id: number;
    distance: number;
    subject: string;
    grade: number;
    section: string;
    topic: string;
    hours: number;
  }>;
  return rows.slice(0, k).map((r) => ({
    topic_id: r.topic_id,
    subject: r.subject,
    grade: r.grade,
    section: r.section,
    topic: r.topic,
    hours: r.hours,
    vec_distance: r.distance,
    combined_score: 1 / (1 + r.distance),
  }));
}

function mergeHits(ftsHits: SearchHit[], vecHits: SearchHit[], k: number): SearchHit[] {
  // Reciprocal Rank Fusion: для каждой темы score = sum(1 / (60 + rank_i))
  const RRF_K = 60;
  const byId = new Map<number, SearchHit & { score: number }>();
  for (const [idx, h] of ftsHits.entries()) {
    const cur = byId.get(h.topic_id);
    const inc = 1 / (RRF_K + idx + 1);
    if (cur) {
      cur.score += inc;
      cur.fts_rank = h.fts_rank;
    } else {
      byId.set(h.topic_id, { ...h, score: inc });
    }
  }
  for (const [idx, h] of vecHits.entries()) {
    const cur = byId.get(h.topic_id);
    const inc = 1 / (RRF_K + idx + 1);
    if (cur) {
      cur.score += inc;
      cur.vec_distance = h.vec_distance;
    } else {
      byId.set(h.topic_id, { ...h, score: inc });
    }
  }
  const merged = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, k);
  return merged.map((m) => ({
    topic_id: m.topic_id,
    subject: m.subject,
    grade: m.grade,
    section: m.section,
    topic: m.topic,
    hours: m.hours,
    fts_rank: m.fts_rank,
    vec_distance: m.vec_distance,
    combined_score: m.score,
  }));
}

export function registerFgosSearchTool(server: McpServer): void {
  server.tool(
    "fgos_search",
    "Гибридный поиск по программам ФРП (все предметы и классы). Использует полнотекстовый индекс (FTS5) для точных терминов и семантический поиск (e5-base + sqlite-vec) для смысловых запросов. Возвращает топ-K релевантных тем с предметом, классом, разделом и часами. Используй когда нужно найти 'что подходит для урока про X' через смысл, а не точное название.",
    {
      query: z.string().min(2).describe("Поисковый запрос на русском (тема, понятие, ключевые слова)"),
      k: z.number().int().min(1).max(20).default(5).describe("Сколько результатов вернуть (1-20, по умолчанию 5)"),
      mode: z
        .enum(["hybrid", "fts", "semantic"])
        .default("hybrid")
        .describe("Режим: hybrid (по умолчанию, FTS+vector), fts (только точный), semantic (только семантический)"),
      subject: z.string().optional().describe("Фильтр по предмету (русский, математика, физика, литература)"),
      grade: z.number().int().min(5).max(11).optional().describe("Фильтр по классу (5-11)"),
    },
    async ({ query, k, mode, subject, grade }) => {
      const subjectId = subject ? resolveSubject(subject) : undefined;

      let ftsHits: SearchHit[] = [];
      let vecHits: SearchHit[] = [];

      if (mode === "fts" || mode === "hybrid") {
        ftsHits = ftsSearch(query, k, subjectId, grade);
      }
      if (mode === "semantic" || mode === "hybrid") {
        try {
          vecHits = await vecSearch(query, k, subjectId, grade);
        } catch (err) {
          vecHits = [];
          if (mode === "semantic") {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Семантический поиск недоступен: ${(err as Error).message}\nПопробуй mode: "fts".`,
                },
              ],
            };
          }
        }
      }

      const hits = mode === "hybrid" ? mergeHits(ftsHits, vecHits, k) : (mode === "fts" ? ftsHits : vecHits);

      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ничего не найдено по запросу "${query}"${subjectId ? ` (предмет: ${subjectId})` : ""}${grade ? ` (класс: ${grade})` : ""}.\nПопробуй переформулировать или сменить mode.`,
            },
          ],
        };
      }

      const result = {
        query,
        mode,
        filters: { subject: subjectId ?? null, grade: grade ?? null },
        count: hits.length,
        hits: hits.map((h) => ({
          subject: h.subject,
          grade: h.grade,
          section: h.section,
          topic: h.topic,
          hours: h.hours,
          score: Number(h.combined_score.toFixed(4)),
          fts_rank: h.fts_rank !== undefined ? Number(h.fts_rank.toFixed(3)) : null,
          vec_distance: h.vec_distance !== undefined ? Number(h.vec_distance.toFixed(3)) : null,
        })),
        hint: "Чтобы получить полные планируемые результаты по найденной теме — вызови mcp__teacher__fgos_lookup с subject+grade+topic.",
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
