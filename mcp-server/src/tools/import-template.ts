import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename, extname } from "path";

const USER_TEMPLATES_DIR = join(process.cwd(), "user-data", "templates");

interface TemplateMetadata {
  name: string;
  type: string;
  original_filename: string;
  format: string;
  imported_at: string;
  structure: string[];
}

export function analyzeMarkdownStructure(content: string): string[] {
  const structure: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.startsWith("# ")) {
      structure.push(`H1: ${line.replace(/^# /, "")}`);
    } else if (line.startsWith("## ")) {
      structure.push(`H2: ${line.replace(/^## /, "")}`);
    } else if (line.startsWith("### ")) {
      structure.push(`H3: ${line.replace(/^### /, "")}`);
    } else if (line.startsWith("|") && !line.match(/^\|[\s\-:|]+\|$/)) {
      if (!structure.includes("TABLE")) {
        structure.push("TABLE");
      }
    }
  }

  return structure;
}

export function registerImportTemplateTool(server: McpServer): void {
  server.tool(
    "import_template",
    "Импорт пользовательского шаблона документа (Markdown) для использования при генерации учебных материалов.",
    {
      template_path: z.string().describe("Путь к файлу шаблона"),
      doc_type: z
        .enum(["lesson-plan", "test", "thematic-plan", "report", "assignment", "lab-work"])
        .describe("Тип документа: lesson-plan, test, thematic-plan, report, assignment, lab-work"),
    },
    async ({ template_path, doc_type }) => {
      if (!existsSync(template_path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ошибка: файл "${template_path}" не найден.`,
            },
          ],
        };
      }

      // Ensure templates directory exists
      await mkdir(USER_TEMPLATES_DIR, { recursive: true });

      const content = await readFile(template_path, "utf-8");
      const ext = extname(template_path);
      const originalName = basename(template_path);
      const targetName = `${doc_type}${ext}`;
      const targetPath = join(USER_TEMPLATES_DIR, targetName);

      // Copy template
      await writeFile(targetPath, content, "utf-8");

      // Analyze structure
      const structure = analyzeMarkdownStructure(content);

      // Save metadata
      const metadata: TemplateMetadata = {
        name: targetName,
        type: doc_type,
        original_filename: originalName,
        format: ext.replace(".", ""),
        imported_at: new Date().toISOString(),
        structure,
      };

      const metadataPath = join(USER_TEMPLATES_DIR, `${doc_type}.meta.json`);
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Шаблон успешно импортирован!`,
              ``,
              `Файл: ${targetPath}`,
              `Тип: ${doc_type}`,
              `Исходный файл: ${originalName}`,
              ``,
              `Распознанная структура:`,
              ...structure.map((s) => `  - ${s}`),
              ``,
              `Шаблон будет использоваться при генерации документов типа "${doc_type}".`,
            ].join("\n"),
          },
        ],
      };
    }
  );
}
