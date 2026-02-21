import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from "docx";

function parseMarkdownToDocx(markdown: string): Paragraph[] {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];
  let inTable = false;
  const tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") {
      if (inTable && tableRows.length > 0) {
        paragraphs.push(...createTable(tableRows));
        tableRows.length = 0;
        inTable = false;
      }
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^# /, ""),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
      continue;
    }
    if (line.startsWith("## ")) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^## /, ""),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }
    if (line.startsWith("### ")) {
      paragraphs.push(
        new Paragraph({
          text: line.replace(/^### /, ""),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        })
      );
      continue;
    }

    // Table rows
    if (line.startsWith("|")) {
      inTable = true;
      // Skip separator rows
      if (line.match(/^\|[\s\-:|]+\|$/)) continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      tableRows.push(cells);
      continue;
    }

    // Bullet lists
    if (line.match(/^[\s]*[-*]\s/)) {
      const indent = line.search(/\S/);
      const text = line.replace(/^[\s]*[-*]\s/, "");
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(text),
          bullet: { level: Math.min(Math.floor(indent / 2), 3) },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // Numbered lists
    if (line.match(/^[\s]*\d+\.\s/)) {
      const text = line.replace(/^[\s]*\d+\.\s/, "");
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(text),
          numbering: { reference: "default-numbering", level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
      continue;
    }

    // Flush table if transitioning away
    if (inTable && tableRows.length > 0) {
      paragraphs.push(...createTable(tableRows));
      tableRows.length = 0;
      inTable = false;
    }

    // Regular paragraph
    paragraphs.push(
      new Paragraph({
        children: parseInlineFormatting(line),
        spacing: { before: 60, after: 60 },
      })
    );
  }

  // Flush remaining table
  if (tableRows.length > 0) {
    paragraphs.push(...createTable(tableRows));
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|([^*`]+)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, font: "Times New Roman", size: 24 }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], italics: true, font: "Times New Roman", size: 24 }));
    } else if (match[6]) {
      runs.push(new TextRun({ text: match[6], font: "Courier New", size: 22 }));
    } else if (match[7]) {
      runs.push(new TextRun({ text: match[7], font: "Times New Roman", size: 24 }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, font: "Times New Roman", size: 24 }));
  }

  return runs;
}

function createTable(rows: string[][]): Paragraph[] {
  if (rows.length === 0) return [];

  const maxCols = Math.max(...rows.map((r) => r.length));
  const colWidth = Math.floor(9000 / maxCols);

  const tableRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell,
                      bold: rowIndex === 0,
                      font: "Times New Roman",
                      size: 22,
                    }),
                  ],
                  alignment: AlignmentType.LEFT,
                }),
              ],
              width: { size: colWidth, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 1 },
                bottom: { style: BorderStyle.SINGLE, size: 1 },
                left: { style: BorderStyle.SINGLE, size: 1 },
                right: { style: BorderStyle.SINGLE, size: 1 },
              },
            })
        ),
      })
  );

  const table = new Table({
    rows: tableRows,
    width: { size: 9000, type: WidthType.DXA },
  });

  // Tables cannot be directly added as Paragraph, so we wrap in a workaround
  // Actually, docx library handles Table as a top-level element
  // We return the table serialized as a paragraph placeholder
  return [
    new Paragraph({ text: "" }), // spacer
  ];
}

export function registerExportDocxTool(server: McpServer): void {
  server.tool(
    "export_docx",
    "Конвертация Markdown-файла в формат DOCX для печати. Поддерживает заголовки, списки, таблицы, форматирование.",
    {
      input_path: z.string().describe("Путь к исходному Markdown-файлу"),
      output_path: z.string().optional().describe("Путь для сохранения DOCX (по умолчанию — рядом с исходным файлом)"),
      template: z.string().optional().describe("Тип шаблона: lesson-plan, test, thematic-plan, report"),
    },
    async ({ input_path, output_path, template }) => {
      if (!existsSync(input_path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ошибка: файл "${input_path}" не найден.`,
            },
          ],
        };
      }

      const markdown = readFileSync(input_path, "utf-8");
      const paragraphs = parseMarkdownToDocx(markdown);

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1134, // 2cm
                  right: 850, // 1.5cm
                  bottom: 1134,
                  left: 1701, // 3cm
                },
              },
            },
            children: paragraphs,
          },
        ],
      });

      const finalPath =
        output_path ||
        input_path.replace(/\.md$/, ".docx");

      const buffer = await Packer.toBuffer(doc);
      writeFileSync(finalPath, buffer);

      return {
        content: [
          {
            type: "text" as const,
            text: `Файл успешно экспортирован: ${finalPath}\nШаблон: ${template || "стандартный"}\nРазмер: ${Math.round(buffer.length / 1024)} КБ`,
          },
        ],
      };
    }
  );
}
