# Cowork MCP Auto-Approve Implementation Plan

> **⚠️ STALE — implementation diverged.** This plan was written before the canonical Claude Code plugin-MCP naming convention was confirmed. It still references the wrong tool prefix `mcp__teacher__*` throughout. The actual implementation uses `mcp__plugin_teacher-assistant_teacher__*` per Anthropic docs. See:
> - Updated spec: [`../specs/2026-04-27-cowork-mcp-auto-approve-design.md`](../specs/2026-04-27-cowork-mcp-auto-approve-design.md) §5.1
> - Correction commit: `4a9a0ea fix(hooks): use canonical plugin-MCP tool name prefix`
> - Skill frontmatter alignment: `3ac3d5b fix(skills): use canonical plugin-MCP tool names in allowed-tools`
>
> Read the spec, not this file, for current state. Kept here for the audit trail.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate "User rejected using" errors on `mcp__teacher__*` tool calls in Claude Cowork by adding a PreToolUse hook that auto-approves the plugin's own MCP tools, with no manual user setup required after `/plugin install`.

**Architecture:** Add a single dependency-free Node script (`hooks/auto-approve-teacher-mcp.mjs`) that reads PreToolUse JSON from stdin, emits an `permissionDecision: "allow"` grant for any `tool_name` matching `mcp__teacher__*`, and is no-op for everything else. Wire it into the plugin's existing `hooks/hooks.json`. Clean up dead config (duplicate `.mcp.json`, plugin-bundled `.claude/settings.json` allow-list that doesn't travel to installers). Bump plugin version so `/plugin update` picks it up.

**Tech Stack:** Node.js (>=18, ESM), Vitest 4.x for tests via `child_process.spawnSync`, no new runtime dependencies.

**Source of truth:** [docs/superpowers/specs/2026-04-27-cowork-mcp-auto-approve-design.md](../specs/2026-04-27-cowork-mcp-auto-approve-design.md)

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `hooks/auto-approve-teacher-mcp.mjs` | **Create** | The hook script. Reads stdin, decides allow/no-op. ~30 LOC. |
| `mcp-server/src/__tests__/hooks/auto-approve.test.ts` | **Create** | Vitest test that spawns the hook script via `child_process` and validates 6 CLI contract cases. |
| `hooks/hooks.json` | **Modify** | Add `PreToolUse` entry alongside existing `SessionStart` and `PostToolUse`. |
| `.mcp.json` | **Delete** | Duplicates `mcpServers` already declared in `plugin.json`. Remove to avoid drift. |
| `.claude/settings.json` | **Modify** | Remove dead `mcp__teacher__*` entries from `permissions.allow`. Keep dev defaults (Read/Write/Skill/Bash/env). |
| `.claude/settings.local.json` | **Modify** | Merge the removed `mcp__teacher__*` entries into existing `permissions.allow` array (append, do not overwrite). |
| `.claude-plugin/plugin.json` | **Modify** | Bump `version` `1.0.0` → `1.0.1`. |
| `.claude-plugin/marketplace.json` | **Modify** | Bump `plugins[0].version` `1.0.0` → `1.0.1`. |
| `README.md` | **Modify** | Append a "Permissions and trust" section near install instructions. |

---

## Task 1: Write failing test for the hook

**Files:**
- Create: `mcp-server/src/__tests__/hooks/auto-approve.test.ts`

The test spawns the hook script via `node` with JSON piped on stdin and asserts exit code + stdout. Six cases per spec §6.1.

- [ ] **Step 1.1: Create the test file**

```typescript
// mcp-server/src/__tests__/hooks/auto-approve.test.ts
import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(__dirname, "../../../../hooks/auto-approve-teacher-mcp.mjs");

function runHook(stdin: string) {
  const result = spawnSync("node", [HOOK_PATH], {
    input: stdin,
    encoding: "utf-8",
    timeout: 5000,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe("auto-approve-teacher-mcp hook", () => {
  it("approves mcp__teacher__fgos_lookup", () => {
    const input = JSON.stringify({ tool_name: "mcp__teacher__fgos_lookup", tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(typeof parsed.hookSpecificOutput.permissionDecisionReason).toBe("string");
  });

  it("approves mcp__teacher__grade_analytics", () => {
    const input = JSON.stringify({ tool_name: "mcp__teacher__grade_analytics", tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("is no-op for Bash", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("is no-op for foreign MCP server", () => {
    const input = JSON.stringify({ tool_name: "mcp__other_server__some_tool", tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("survives invalid JSON on stdin", () => {
    const { stdout, status } = runHook("not-json{{");
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("survives empty stdin", () => {
    const { stdout, status } = runHook("");
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd mcp-server && npm test -- src/__tests__/hooks/auto-approve.test.ts`

Expected: All 6 cases fail. The exact message will be along the lines of "Cannot find module" or non-zero exit because `hooks/auto-approve-teacher-mcp.mjs` does not exist yet — `node` will exit with code 1 and stderr like `Error: Cannot find module '.../hooks/auto-approve-teacher-mcp.mjs'`.

If tests pass at this point, something is wrong — stop and investigate.

---

## Task 2: Implement the hook script

**Files:**
- Create: `hooks/auto-approve-teacher-mcp.mjs`

Dependency-free ESM Node script. Reads all of stdin, parses JSON, checks `tool_name` prefix, emits grant or no-op. Never throws.

- [ ] **Step 2.1: Create the hook script**

```javascript
// hooks/auto-approve-teacher-mcp.mjs
//
// PreToolUse hook for the teacher-assistant plugin.
// Auto-approves invocations of the plugin's own MCP tools (mcp__teacher__*)
// to work around Cowork permission-flow bugs. No-op for any other tool.
//
// Spec: docs/superpowers/specs/2026-04-27-cowork-mcp-auto-approve-design.md
// Hook protocol: https://code.claude.com/docs/en/hooks

const TOOL_PREFIX = "mcp__teacher__";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

function decide(rawInput) {
  let parsed;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    return null;
  }
  const toolName = parsed && typeof parsed.tool_name === "string" ? parsed.tool_name : null;
  if (!toolName || !toolName.startsWith(TOOL_PREFIX)) {
    return null;
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "teacher-assistant plugin pre-approves its own MCP tools",
    },
  };
}

const raw = await readStdin();
const decision = decide(raw);
if (decision) {
  process.stdout.write(JSON.stringify(decision));
}
process.exit(0);
```

- [ ] **Step 2.2: Run tests to verify they pass**

Run: `cd mcp-server && npm test -- src/__tests__/hooks/auto-approve.test.ts`

Expected: All 6 cases PASS.

- [ ] **Step 2.3: Run the full test suite to confirm no regressions**

Run: `cd mcp-server && npm test`

Expected: All existing tests + 6 new tests pass. Total should be 96 (90 existing + 6 new).

- [ ] **Step 2.4: Commit**

```bash
cd "/Users/marshalkin/Documents/Knotta/ПРОЕКТЫ/Центр Знание/педсовет-весна-2026/skills/teacher-assistant"
git add hooks/auto-approve-teacher-mcp.mjs mcp-server/src/__tests__/hooks/auto-approve.test.ts
git commit -m "feat(hooks): PreToolUse hook auto-approves plugin's own MCP tools

Dependency-free Node script that emits permissionDecision: allow for
any tool_name starting with mcp__teacher__. No-op for everything else.
Survives invalid/empty stdin without throwing.

Six-case test suite spawns the script via child_process to validate
the real CLI contract."
```

---

## Task 3: Register the hook in hooks.json

**Files:**
- Modify: `hooks/hooks.json`

Add `PreToolUse` entry between `SessionStart` and `PostToolUse`. Existing entries stay untouched.

- [ ] **Step 3.1: Replace `hooks/hooks.json` with the updated version**

Full file content (overwrite):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "mkdir -p user-data/grade-book user-data/templates 2>/dev/null; exit 0"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "mcp__teacher__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve-teacher-mcp.mjs\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/check-teaching-doc.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3.2: Validate JSON syntax**

Run: `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json', 'utf-8')); console.log('ok')"`

Expected: `ok`

- [ ] **Step 3.3: Commit**

```bash
git add hooks/hooks.json
git commit -m "feat(hooks): register PreToolUse auto-approve for mcp__teacher__*

Wires hooks/auto-approve-teacher-mcp.mjs into the plugin's hook
registry. Matcher mcp__teacher__.* is the first filter; the script
also re-checks the prefix as defense-in-depth."
```

---

## Task 4: Remove duplicate `.mcp.json`

**Files:**
- Delete: `.mcp.json`

`mcpServers` is already declared in `plugin.json`. Keeping both invites drift — pick one. Plugin-manifest declaration is authoritative for plugin distribution.

- [ ] **Step 4.1: Confirm `plugin.json` already has `mcpServers`**

Run: `node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json', 'utf-8')).mcpServers, null, 2))"`

Expected output:
```json
{
  "teacher": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/bundle.js"],
    "env": {
      "NODE_ENV": "production"
    }
  }
}
```

If `plugin.json` does NOT contain `mcpServers`, stop and investigate before deleting `.mcp.json` — the hook still works, but MCP server config would vanish.

- [ ] **Step 4.2: Delete `.mcp.json`**

Run: `rm .mcp.json`

- [ ] **Step 4.3: Commit**

```bash
git add -A .mcp.json
git commit -m "chore: remove duplicate .mcp.json

mcpServers is declared in .claude-plugin/plugin.json. Holding both
configs invites drift; the plugin manifest is authoritative."
```

---

## Task 5: Clean dead MCP allow-list out of plugin-bundled `.claude/settings.json`

**Files:**
- Modify: `.claude/settings.json`
- Modify: `.claude/settings.local.json`

The plugin-bundled `.claude/settings.json` only takes effect when someone works *inside the plugin repo* — it does NOT travel to users who install the plugin via marketplace. Keeping `mcp__teacher__*` entries there misleads future contributors. Move them into the gitignored `.claude/settings.local.json` (merging with existing entries) so the maintainer keeps frictionless access during dev.

- [ ] **Step 5.1: Replace `.claude/settings.json` with cleaned version**

Full file content (overwrite):

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write(*.md)",
      "Write(*.json)",
      "Write(*.csv)",
      "Write(*.docx)",
      "Skill",
      "Bash(pandoc *)",
      "Bash(node mcp-server/*)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Write(.env)"
    ]
  },
  "env": {
    "TEACHER_PLUGIN_VERSION": "1.0.1",
    "DEFAULT_GRADE_SYSTEM": "5-point"
  }
}
```

Note: `TEACHER_PLUGIN_VERSION` is bumped to match the version bump in Task 7. The five `mcp__teacher__*` allow entries are removed.

- [ ] **Step 5.2: Replace `.claude/settings.local.json` with merged version**

Full file content (overwrite). This file is gitignored — exists only on the maintainer's machine. Merges the removed MCP entries with existing Bash entries:

```json
{
  "permissions": {
    "allow": [
      "Bash(git fetch *)",
      "Bash(git status *)",
      "Bash(cat .claude-plugin/plugin.json)",
      "Bash(cat .claude-plugin/marketplace.json)",
      "Bash(find . -maxdepth 4 -name \"settings*.json\" -not -path \"./node_modules/*\" -not -path \"./.git/*\")",
      "Bash(cat .mcp.json)",
      "Bash(ls mcp-server/)",
      "mcp__teacher__fgos_lookup",
      "mcp__teacher__export_docx",
      "mcp__teacher__import_template",
      "mcp__teacher__hours_calculator",
      "mcp__teacher__grade_analytics"
    ]
  }
}
```

- [ ] **Step 5.3: Verify `.claude/settings.local.json` is gitignored**

Run: `git check-ignore .claude/settings.local.json && echo "gitignored: ok"`

Expected: `.claude/settings.local.json\ngitignored: ok`

If NOT gitignored, stop and add `.claude/settings.local.json` to `.gitignore` before continuing.

- [ ] **Step 5.4: Commit (only `.claude/settings.json` — local is gitignored)**

```bash
git add .claude/settings.json
git commit -m "chore(settings): remove dead mcp__teacher__* allow-list

Plugin-bundled .claude/settings.json does not travel to users who
install via marketplace — the entries only ever activated when
working inside the plugin repo. Removing to avoid misleading future
contributors. Maintainer dev allows now live in the gitignored
.claude/settings.local.json. Cowork-installer flow is handled by
the PreToolUse hook added in earlier commits."
```

---

## Task 6: Bump plugin version to 1.0.1

**Files:**
- Modify: `.claude-plugin/plugin.json` (line with `"version": "1.0.0"`)
- Modify: `.claude-plugin/marketplace.json` (line with `"version": "1.0.0"` inside `plugins[0]`)

Without this bump, Claude Code will not pick up the new hook on `/plugin update` for users who already installed `1.0.0`.

- [ ] **Step 6.1: Bump `.claude-plugin/plugin.json`**

Find line: `"version": "1.0.0",`
Replace with: `"version": "1.0.1",`

(There is only one `version` field at top level — safe to use Edit with the full surrounding context: `"version": "1.0.0",` immediately preceded by `"description": "...",` and followed by `"author": {`.)

- [ ] **Step 6.2: Bump `.claude-plugin/marketplace.json`**

Find line (inside `plugins[0]`): `"version": "1.0.0",`
Replace with: `"version": "1.0.1",`

- [ ] **Step 6.3: Sanity-check both files**

Run:
```bash
node -e "console.log('plugin:', JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf-8')).version)"
node -e "console.log('marketplace:', JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf-8')).plugins[0].version)"
```

Expected:
```
plugin: 1.0.1
marketplace: 1.0.1
```

- [ ] **Step 6.4: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "chore: bump plugin version 1.0.0 -> 1.0.1

Required for /plugin update to pick up the PreToolUse auto-approve
hook on installs that already cached 1.0.0."
```

---

## Task 7: Add "Permissions and trust" section to README

**Files:**
- Modify: `README.md`

Per Anthropic's plugin-trust transparency expectations (support.claude.com/articles/13837440), the user should see exactly which tools the plugin auto-approves before they accept the plugin trust dialog.

- [ ] **Step 7.1: Determine where to insert the section**

Read the current `README.md`. Insert the new section **after the "Установка" (installation) section** and **before the next major section** (most likely "Команды" or similar). Section is in Russian to match the rest of the README.

- [ ] **Step 7.2: Insert the following block**

Use Edit to add this exact block. Match it after a horizontal rule or before the next `## ` heading after install instructions:

```markdown
## Разрешения и доверие

Плагин содержит локальный MCP-сервер `teacher` с пятью инструментами:

- `mcp__teacher__fgos_lookup` — поиск формулировок ФГОС/ФОП/ФРП
- `mcp__teacher__grade_analytics` — анализ оценок (CSV/XLSX, в т.ч. cp1251)
- `mcp__teacher__hours_calculator` — расчёт учебных часов
- `mcp__teacher__export_docx` — экспорт markdown в DOCX
- `mcp__teacher__import_template` — импорт пользовательских шаблонов

Чтобы инструменты работали без диалогов разрешений (особенно в Claude Cowork, где штатный permission-флоу для plugin-MCP нестабилен), плагин включает **PreToolUse-хук** `hooks/auto-approve-teacher-mcp.mjs`. Хук авто-апрувит **только** вызовы своих собственных пяти инструментов (`mcp__teacher__*`) и ничего больше.

**Что плагин НЕ делает автоматически:**

- Не авто-апрувит Bash, Edit, Write, Read и любые другие встроенные инструменты Claude Code.
- Не авто-апрувит инструменты других MCP-серверов.
- Не пишет на диск вне `user-data/` (path-whitelist обеспечивается отдельным хуком `check-teaching-doc.mjs`).
- Не выходит в сеть из MCP-сервера.

Установив плагин, вы соглашаетесь именно с этим поведением. Чтобы откатить — отключите плагин через `/plugin disable` или удалите запись `PreToolUse` из `hooks/hooks.json`.

> **Для контрибьюторов:** `permissions.allow` в плагин-bundled `.claude/settings.json` **не путешествует** с плагином к установившим — это особенность Claude Code. Только запись плагина в `~/.claude/settings.json` пользователя, managed-settings, или хук-уровень auto-approve реально работают для дистрибуции. Не пытайтесь «починить» permission через `.claude/settings.json` плагина.
```

- [ ] **Step 7.3: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Permissions and trust section

Explains exactly which tools the plugin auto-approves
(mcp__teacher__* only) and what it does not auto-approve. Required
for plugin-trust transparency per Anthropic guidance. Includes a
contributor note that bundled .claude/settings.json does not
distribute permissions to installers."
```

---

## Task 8: Final smoke test in Claude Code CLI

**Files:** none modified

Validate the change actually works in a real Claude Code CLI session before considering the work done.

- [ ] **Step 8.1: Run the full test suite one more time**

Run: `cd mcp-server && npm test`

Expected: 96 tests pass (90 existing + 6 new). No regressions.

- [ ] **Step 8.2: Verify hooks.json structure**

Run:
```bash
cd "/Users/marshalkin/Documents/Knotta/ПРОЕКТЫ/Центр Знание/педсовет-весна-2026/skills/teacher-assistant"
node -e "
const h = JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')).hooks;
console.log('SessionStart:', !!h.SessionStart, '(', h.SessionStart?.length, ')');
console.log('PreToolUse:', !!h.PreToolUse, '(', h.PreToolUse?.length, ', matcher:', h.PreToolUse?.[0]?.matcher, ')');
console.log('PostToolUse:', !!h.PostToolUse, '(', h.PostToolUse?.length, ')');
"
```

Expected:
```
SessionStart: true ( 1 )
PreToolUse: true ( 1 , matcher: mcp__teacher__.* )
PostToolUse: true ( 1 )
```

- [ ] **Step 8.3: Manual hook smoke test from shell**

Run:
```bash
echo '{"tool_name":"mcp__teacher__fgos_lookup","tool_input":{}}' | node hooks/auto-approve-teacher-mcp.mjs
```

Expected stdout (single line):
```json
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"teacher-assistant plugin pre-approves its own MCP tools"}}
```

Run:
```bash
echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | node hooks/auto-approve-teacher-mcp.mjs
echo "exit=$?"
```

Expected: empty stdout, `exit=0`.

- [ ] **Step 8.4: Confirm `.mcp.json` is gone, `plugin.json` still has mcpServers**

Run:
```bash
test ! -f .mcp.json && echo ".mcp.json: removed (ok)"
node -e "const p=JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf-8')); console.log('mcpServers.teacher:', !!p.mcpServers?.teacher, 'version:', p.version)"
```

Expected:
```
.mcp.json: removed (ok)
mcpServers.teacher: true version: 1.0.1
```

- [ ] **Step 8.5: Push the branch (or main, depending on workflow chosen by user)**

This step requires explicit user confirmation per the project's workflow rules — do NOT push without asking. Stop here and report:

> "All 7 implementation tasks are committed. Smoke checks pass locally. Ready to push to origin and (optionally) cut a PR or push directly to main per your standard. Which one?"

Wait for user direction. Do not push, force-push, or merge without it.

---

## Out of scope (explicitly NOT in this plan)

- Cowork smoke test (spec §6.3) — requires the user to install the plugin in Cowork and run a real lesson-plan scenario. Not automatable in this session.
- Variant C fallback (spec §8 Risk 1 mitigation) — only triggered if Cowork smoke test fails. Separate plan if needed.
- PR #4 (SQLite-vec) — explicit non-goal per spec §3.

---

## Self-Review checklist (run before declaring complete)

- [ ] All 6 test cases from spec §6.1 are present in Task 1.
- [ ] Hook script in Task 2 implements both prefix-check AND tolerates invalid/empty stdin per spec §5.1 contract.
- [ ] Task 3 preserves existing `SessionStart` and `PostToolUse` entries verbatim.
- [ ] Task 4 verifies `plugin.json` mcpServers exists BEFORE deleting `.mcp.json`.
- [ ] Task 5 keeps `.claude/settings.local.json` gitignored (verification step included).
- [ ] Task 6 bumps version in BOTH manifests (plugin.json + marketplace.json).
- [ ] Task 7 README section is in Russian and lists all 5 tools by exact name.
- [ ] No step contains "TBD", "TODO", or "similar to above" without inline content.
- [ ] No step references a function/method/property that wasn't defined earlier in the same plan.
