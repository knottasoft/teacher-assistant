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
