-- FGOS database schema
-- Источник данных: JSON-файлы в src/data/fgos/*.json,
-- которые в свою очередь получены из ФРП Минпросвещения России
-- (Институт содержания и методов обучения им. В.С. Леднева, 2025).
--
-- Загрузка: scripts/build-fgos-db.mjs читает JSON и наполняет эту схему,
-- затем генерирует embeddings через @xenova/transformers (e5-base) и
-- индексирует через sqlite-vec.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- =============================================================================
-- Метаданные
-- =============================================================================

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- ключи: schema_version, generated_at, source_frp_version, embedding_model

-- =============================================================================
-- Нормативные документы (на каждый предмет — свой набор)
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,         -- fgos_ooo, fgos_soo, fop_ooo, fop_soo, frp_update_2024, ...
  description TEXT NOT NULL,
  UNIQUE(subject_id, doc_key)
);
CREATE INDEX IF NOT EXISTS idx_documents_subject ON documents(subject_id);

-- =============================================================================
-- Предметы и классы
-- =============================================================================

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,           -- russian, math, physics, literature
  name TEXT NOT NULL,            -- "Русский язык", "Математика", ...
  standard_ooo TEXT,
  standard_soo TEXT,
  documents_note TEXT
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL,        -- 5..11
  level TEXT NOT NULL,           -- "ООО" | "СОО"
  hours_per_week INTEGER NOT NULL,
  total_hours_per_year INTEGER NOT NULL,
  source_note TEXT,
  control_works_json TEXT,       -- JSON с произвольными счётчиками контрольных
  UNIQUE(subject_id, grade)
);
CREATE INDEX IF NOT EXISTS idx_grades_subject_grade ON grades(subject_id, grade);

-- =============================================================================
-- Структура программы: разделы → темы
-- =============================================================================

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_id INTEGER NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,     -- порядок в классе
  name TEXT NOT NULL,
  hours INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sections_grade ON sections(grade_id, position);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  hours INTEGER NOT NULL,
  control_types_json TEXT NOT NULL  -- JSON-массив строк
);
CREATE INDEX IF NOT EXISTS idx_topics_section ON topics(section_id, position);

-- =============================================================================
-- Планируемые результаты (subject / meta / personal)
-- Денормализуем как (topic_id, kind, position, text)
-- kind ∈ {'subject', 'meta', 'personal'}
-- =============================================================================

CREATE TABLE IF NOT EXISTS planned_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('subject', 'meta', 'personal')),
  position INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_planned_results_topic ON planned_results(topic_id, kind, position);

-- =============================================================================
-- УУД (cognitive / regulative / communicative / personal)
-- =============================================================================

CREATE TABLE IF NOT EXISTS uud (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('cognitive', 'regulative', 'communicative', 'personal')),
  position INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uud_topic ON uud(topic_id, kind, position);

-- =============================================================================
-- FTS5 — полнотекстовый поиск по темам и планируемым результатам
-- Контентная таблица — topics; результаты и УУД индексируем
-- через триггеры/преагрегацию.
-- Простоты ради собираем агрегированный «поисковый текст» при
-- наполнении базы и кладём в отдельную теневую таблицу.
-- =============================================================================

CREATE TABLE IF NOT EXISTS topic_search_index (
  topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  section TEXT NOT NULL,
  topic TEXT NOT NULL,
  full_text TEXT NOT NULL          -- topic name + section + planned_results + uud + control_types
);

CREATE VIRTUAL TABLE IF NOT EXISTS topic_search USING fts5(
  subject,
  grade UNINDEXED,
  section,
  topic,
  full_text,
  content='topic_search_index',
  content_rowid='topic_id',
  tokenize='unicode61 remove_diacritics 2'
);

-- =============================================================================
-- Vector search (sqlite-vec)
-- Каждой теме — один вектор от e5-base (768 dim, float32).
-- Загружается только если расширение sqlite-vec доступно.
-- Создание самой vec-таблицы делается в build-скрипте через
-- VEC0 virtual table (CREATE VIRTUAL TABLE topic_vec USING vec0(...)).
-- Здесь оставляем только метаданные о вычислении.
-- =============================================================================

CREATE TABLE IF NOT EXISTS embedding_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_name TEXT NOT NULL,        -- "intfloat/multilingual-e5-base"
  dimension INTEGER NOT NULL,      -- 768
  generated_at TEXT NOT NULL,
  topic_count INTEGER NOT NULL
);
