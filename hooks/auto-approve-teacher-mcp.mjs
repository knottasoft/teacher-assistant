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
