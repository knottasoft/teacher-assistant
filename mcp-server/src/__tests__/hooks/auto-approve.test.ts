// mcp-server/src/__tests__/hooks/auto-approve.test.ts
//
// Tests the PreToolUse hook that auto-approves the plugin's own MCP tools.
// The hook lives at <repo>/hooks/auto-approve-teacher-mcp.mjs (outside mcp-server/);
// these tests live inside mcp-server/ so vitest picks them up automatically.
//
// Spec: docs/superpowers/specs/2026-04-27-cowork-mcp-auto-approve-design.md (§6.1)

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = resolve(__dirname, "../../../../hooks/auto-approve-teacher-mcp.mjs");

const PLUGIN_PREFIX = "mcp__plugin_teacher-assistant_teacher__";

function runHook(stdin: string) {
  const result = spawnSync("node", [HOOK_PATH], {
    input: stdin,
    encoding: "utf-8",
    timeout: 5000,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe("auto-approve-teacher-mcp hook", () => {
  it("approves fgos_lookup under canonical plugin prefix", () => {
    const input = JSON.stringify({ tool_name: `${PLUGIN_PREFIX}fgos_lookup`, tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PreToolUse");
    expect(parsed.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(typeof parsed.hookSpecificOutput.permissionDecisionReason).toBe("string");
  });

  it("approves grade_analytics", () => {
    const input = JSON.stringify({ tool_name: `${PLUGIN_PREFIX}grade_analytics`, tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("approves export_docx", () => {
    const input = JSON.stringify({ tool_name: `${PLUGIN_PREFIX}export_docx`, tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).hookSpecificOutput.permissionDecision).toBe("allow");
  });

  it("is no-op for Bash", () => {
    const input = JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("is no-op for foreign plugin's MCP tool", () => {
    const input = JSON.stringify({ tool_name: "mcp__plugin_other-plugin_other__tool", tool_input: {} });
    const { stdout, status } = runHook(input);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe("");
  });

  it("is no-op for short-form user-MCP (claude mcp add teacher)", () => {
    // Without the plugin wrapper, the same MCP server registered via
    // `claude mcp add teacher -- ...` produces tool names like
    // mcp__teacher__fgos_lookup. That path is by-design out of scope:
    // user-MCP install means the user manages permissions explicitly.
    const input = JSON.stringify({ tool_name: "mcp__teacher__fgos_lookup", tool_input: {} });
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
