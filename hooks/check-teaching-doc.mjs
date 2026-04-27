#!/usr/bin/env node

/**
 * PostToolUse hook for Write — STRICT path-whitelist guard.
 *
 * Назначение этого hook'а — **узкая страховка**: ловить случаи, когда пользователь
 * (или Claude вне skill'а) пишет файл в директории, которые принадлежат плагину
 * teacher-assistant, и при этом забыл проставить ключевые педагогические атрибуты
 * (класс, предмет, привязка к ФГОС/ФОП).
 *
 * Hook НЕ должен срабатывать на:
 *   - любой .md за пределами whitelist путей,
 *   - чужие проекты (фронтенды, бэкенды, доки и т.п.) — даже если в них есть
 *     слова «план» или «урок»,
 *   - на скиллы плагина (skills/* — это шаблоны, не учебные документы).
 *
 * Основная валидация ФГОС/ФОП-привязки **делается внутри skill'ов плагина**
 * (см. /lesson-plan, /assignment, /grade-report, ...) — скилл знает свой контекст
 * и контролирует свой вывод. Этот hook остаётся как страховка для прямых вызовов
 * Write вне скилла.
 *
 * Reads JSON from stdin per Claude Code hooks API:
 *   { "tool_name": "Write", "tool_input": { "file_path": "...", "content": "..." }, ... }
 *
 * Поведение:
 *   - Non-Write, файл не в whitelist → silent exit 0 (no-op).
 *   - Файл в whitelist, нет ключевых атрибутов → additionalContext-reminder
 *     (не блокирующий).
 */

import { readFileSync } from "fs";

// Whitelist путей, в которых файлы — это «учительские документы плагина».
// Намеренно жёстко: только директории, которые плагин сам создаёт/использует.
// Никаких эвристик по ключевым словам в имени файла или контенте — это и было
// причиной false-positive в предыдущей версии.
const PATH_WHITELIST = [
  /\/user-data\/(grade-book|lessons|assignments|reports|materials)\/[^/]+\.md$/,
  /\/user-data\/[^/]+\.md$/,                               // user-data/*.md (плоские файлы)
  /\/teacher-assistant\/(lessons|assignments|reports|materials)\/[^/]+\.md$/,
];

const NEGATIVE_PREFIXES = [
  /\/skills\//,             // шаблоны скиллов
  /\/node_modules\//,
  /\/\.git\//,
  /\/\.claude\//,
  /\/test-fixtures\//,
  /\/dist\//,
];

function isInWhitelist(filePath) {
  if (!filePath) return false;
  if (NEGATIVE_PREFIXES.some((re) => re.test(filePath))) return false;
  return PATH_WHITELIST.some((re) => re.test(filePath));
}

function check(content) {
  const issues = [];
  if (!/\b\d{1,2}\s*[А-Яа-я]?\s*класс|класс\s*\d{1,2}/i.test(content)) issues.push("не указан класс");
  if (!/предмет|русский|математика|физика|литература/i.test(content)) {
    issues.push("не указан предмет");
  }
  if (!/фгос|планируемые результаты|ууд|фоп|фрп/i.test(content)) {
    issues.push("нет привязки к ФГОС/ФОП/планируемым результатам");
  }
  return issues;
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf-8"));
} catch {
  process.exit(0);
}

if (payload?.tool_name !== "Write") process.exit(0);

const filePath = payload?.tool_input?.file_path || "";
const content = payload?.tool_input?.content || "";

if (!isInWhitelist(filePath)) process.exit(0);

const issues = check(content);
if (issues.length === 0) process.exit(0);

const reminder = `Учебный документ ${filePath}: проверь — ${issues.join("; ")}. ` +
  `(Подробная валидация выполняется внутри skill'ов плагина; этот hook — последний резерв.)`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: reminder,
  },
}));
process.exit(0);
