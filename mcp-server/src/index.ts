#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerFgosLookupTool } from "./tools/fgos-lookup.js";
import { registerExportDocxTool } from "./tools/export-docx.js";
import { registerImportTemplateTool } from "./tools/import-template.js";
import { registerHoursCalculatorTool } from "./tools/hours-calculator.js";
import { registerGradeAnalyticsTool } from "./tools/grade-analytics.js";
import { registerFgosResources } from "./resources/fgos-standards.js";
import { registerCurriculumResources } from "./resources/curriculum-data.js";

const server = new McpServer({
  name: "teacher",
  version: "1.0.0",
});

// Register tools
registerFgosLookupTool(server);
registerExportDocxTool(server);
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
