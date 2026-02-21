import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUBJECTS = ["russian", "math", "physics", "literature"];
const SUBJECT_NAMES: Record<string, string> = {
  russian: "Русский язык",
  math: "Математика",
  physics: "Физика",
  literature: "Литература",
};

export function registerFgosResources(server: McpServer): void {
  for (const subject of SUBJECTS) {
    const grades = subject === "physics" ? [7, 8, 9, 10, 11] : [5, 6, 7, 8, 9, 10, 11];

    for (const grade of grades) {
      const uri = `fgos://${subject}/${grade}`;
      const name = `ФГОС: ${SUBJECT_NAMES[subject]}, ${grade} класс`;

      server.resource(uri, name, async () => {
        const filePath = join(__dirname, "..", "data", "fgos", `${subject}.json`);
        try {
          const raw = readFileSync(filePath, "utf-8");
          const data = JSON.parse(raw);
          const gradeData = data.grades?.[String(grade)];

          if (!gradeData) {
            return {
              contents: [
                {
                  uri,
                  mimeType: "text/plain",
                  text: `Данные для ${grade} класса не найдены.`,
                },
              ],
            };
          }

          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(
                  {
                    subject: SUBJECT_NAMES[subject],
                    grade,
                    ...gradeData,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch {
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: `Ошибка загрузки данных ФГОС для ${SUBJECT_NAMES[subject]}, ${grade} класс.`,
              },
            ],
          };
        }
      });
    }
  }
}
