# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-26

### Added

- **SQLite + sqlite-vec backend**: данные ФРП теперь живут в `mcp-server/data/fgos.db` (3.79 МБ) вместо инлайн-JSON в bundle. Bundle уменьшен.
- **FTS5 полнотекстовый индекс** по 219 темам всех предметов и классов. Поиск точных терминов (название произведения, понятие) — миллисекунды.
- **Семантический поиск** через `multilingual-e5-base` (Xenova/transformers, ONNX quantized): локальные embeddings без облачных вызовов. ~280 МБ модели скачивается один раз на машину при первом обращении.
- **Новый MCP-инструмент `fgos_search`**: гибридный поиск (FTS5 + vector + RRF-объединение результатов). Параметры: `query`, `mode` (hybrid/fts/semantic), `k`, фильтры `subject` и `grade`.
- **Build-скрипт `scripts/build-fgos-db.mjs`**: пересобирает БД из JSON-источников + регенерирует embeddings. Флаг `--no-vec` для быстрой сборки в CI.
- **Аудит-отчёт** `docs/audit-2026-04-26.md`: полный анализ соответствия плагина действующей нормативной базе и ФРП-2025 Минпросвещения.

### Changed

- **Литература, 8 класс полностью переписана** под ФРП-2025 (Институт содержания и методов обучения им. В.С. Леднева, Москва 2025): 7 разделов, 14 тем, точные часы, формулировки планируемых результатов и видов деятельности из официального документа.
- **Нормативная база приведена в соответствие на 26.04.2026**:
  - ФГОС СОО — корректная формулировка (приказ Минобрнауки №413/2012 в ред. №732/2022, №1028/2023, №93/2025)
  - Добавлены ФОП ООО (приказ №370/2023) и ФОП СОО (приказ №371/2023)
  - Добавлены актуализирующие приказы: №171/2024 (литература), №704/2024 (10% контрольных), №779/2024 (документация педагога)
- `fgos_lookup`: при отсутствии совпадений возвращает компактную discovery-подсказку вместо дампа всей программы класса.
- `import_template`: закрыт path traversal (whitelist расширений `.md/.markdown/.txt`, абсолютный resolve, проверка target внутри `USER_TEMPLATES_DIR`).
- `hooks/hooks.json` — переписан хук PostToolUse: был сломан (использовал несуществующий `$TOOL_INPUT` и дёргал prompt-hook на каждый Write). Заменён на `hooks/check-teaching-doc.mjs`, читающий stdin JSON по правильному API Claude Code.
- `.mcp.json` — путь к bundle через `${CLAUDE_PLUGIN_ROOT}` для консистентности с `.claude-plugin/plugin.json`.
- Внутренний рефакторинг: `src/data/shared.ts`, `tools/fgos-lookup.ts`, `tools/hours-calculator.ts`, `resources/*.ts` — всё работает через SQLite вместо in-memory JSON.

### Notes

- Литература 5, 6, 7, 9 классов и предметы русский/математика/физика **остаются на старом контенте** (методический канон, не сверены с ФРП). Сверка вынесена в план улучшений P1.5–P1.6 в `docs/audit-2026-04-26.md`.
- При первом запуске `fgos_search` в режиме `semantic` или `hybrid` модель e5-base скачивается с HuggingFace (~280 МБ). Кэш остаётся в `node_modules/@xenova/transformers/.cache/`. Последующие вызовы — ~1-2 сек на init, ~25 мс на запрос.

[1.1.0]: https://github.com/knottasoft/teacher-assistant/releases/tag/v1.1.0

## [1.0.0] - 2026-02-21

### Added

- 18 slash-commands for 4 subjects (Russian, Math, Physics, Literature)
- MCP server with 5 tools:
  - `fgos_lookup` — FGOS curriculum database search
  - `export_docx` — Markdown to DOCX conversion
  - `import_template` — custom template import
  - `hours_calculator` — academic hours calculation
  - `grade_analytics` — grade statistics and analysis
- MCP resources: `fgos://` and `curriculum://` URI schemes
- FGOS database covering grades 5-11 (3,400+ lines of curriculum data)
- Pedagogical rules: approach, document formatting, FGOS compliance
- Subject-specific rules: Russian, Math, Physics, Literature
- Lesson plan templates: standard, FGOS-aligned, open lesson
- Assignment templates: test, homework, control work
- OGE/EGE rubrics and criteria
- Hooks: SessionStart metadata, PostToolUse FGOS validation
- Setup script for one-command installation
- CI/CD pipeline with GitHub Actions
- Comprehensive test suite for MCP tools

[1.0.0]: https://github.com/knottasoft/teacher-assistant/releases/tag/v1.0.0
