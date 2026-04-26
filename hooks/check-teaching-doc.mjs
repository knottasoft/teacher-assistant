#!/usr/bin/env node

/**
 * PostToolUse hook for Write — validates teaching documents (.md only).
 *
 * Reads JSON from stdin per Claude Code hooks API:
 *   { "tool_name": "Write", "tool_input": { "file_path": "...", "content": "..." }, ... }
 *
 * Behavior:
 *   - Non-Write tool, non-.md file, or unparseable input → silent exit 0 (no-op).
 *   - Teaching document with missing essentials → emits an additionalContext
 *     hookSpecificOutput entry so Claude sees a brief reminder, but does NOT
 *     block the tool call.
 *
 * Cheap heuristic: only file paths under ./user-data/ or matching common
 * teaching-document keywords are scanned. Everything else is ignored to
 * avoid noise on configs, source code, etc.
 */

import { readFileSync } from "fs";

const TEACHING_KEYWORDS = [
  "lesson", "plan", "assignment", "test", "dictation", "thematic",
  "урок", "план", "задани", "контрольн", "диктант", "ктп", "тематич",
  "сочинени", "лаборатор",
];

function isTeachingDoc(filePath, content) {
  const path = (filePath || "").toLowerCase();
  if (!path.endsWith(".md")) return false;
  if (path.includes("/user-data/")) return true;
  if (TEACHING_KEYWORDS.some((kw) => path.includes(kw))) return true;
  // Or the content itself looks like a teaching document
  const head = (content || "").slice(0, 500).toLowerCase();
  return /класс|фгос|урок|план|задани/.test(head);
}

function check(content) {
  const issues = [];
  if (!/класс/i.test(content)) issues.push("не указан класс");
  if (!/предмет|русский|математика|физика|литература/i.test(content)) {
    issues.push("не указан предмет");
  }
  if (!/фгос|планируемые результаты|ууд|фоп/i.test(content)) {
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

if (!isTeachingDoc(filePath, content)) process.exit(0);

const issues = check(content);
if (issues.length === 0) process.exit(0);

const reminder = `Учебный документ ${filePath}: проверь — ${issues.join("; ")}.`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: reminder,
  },
}));
process.exit(0);
