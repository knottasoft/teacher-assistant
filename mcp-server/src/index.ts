#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFgosLookupTool } from "./tools/fgos-lookup.js";
import { registerImportTemplateTool } from "./tools/import-template.js";
import { registerHoursCalculatorTool } from "./tools/hours-calculator.js";
import { registerGradeAnalyticsTool } from "./tools/grade-analytics.js";
import { registerFgosResources } from "./resources/fgos-standards.js";
import { registerCurriculumResources } from "./resources/curriculum-data.js";

// `title` is the human-readable display name shown by MCP clients
// (Claude Desktop / Cowork's Connectors UI). The protocol-level `name`
// stays as the technical key and remains part of tool prefixes
// (mcp__plugin_teacher-assistant_teacher__*). See MCP spec
// Implementation type — title/description/websiteUrl/icons are optional
// metadata on top of name+version.
const server = new McpServer({
  name: "teacher",
  title: "Учитель — ассистент преподавателя",
  description:
    "AI-помощник учителя средней и старшей школы (5–11 классы): поиск формулировок ФГОС/ФОП/ФРП, аналитика оценок, расчёт учебных часов, импорт школьных шаблонов.",
  websiteUrl: "https://github.com/knottasoft/teacher-assistant",
  version: "1.0.3",
});

// Register tools
registerFgosLookupTool(server);
registerImportTemplateTool(server);
registerHoursCalculatorTool(server);
registerGradeAnalyticsTool(server);

// Register resources
registerFgosResources(server);
registerCurriculumResources(server);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
