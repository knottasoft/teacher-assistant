import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, existsSync } from "fs";
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

export function registerCurriculumResources(server: McpServer): void {
  for (const subject of SUBJECTS) {
    const uri = `curriculum://${subject}`;
    const name = `Программа: ${SUBJECT_NAMES[subject]}`;

    server.resource(uri, name, async () => {
      const filePath = join(__dirname, "..", "data", "curricula", `${subject}-program.json`);

      if (!existsSync(filePath)) {
        // Fall back to FGOS data which contains curriculum info
        const fgosPath = join(__dirname, "..", "data", "fgos", `${subject}.json`);
        try {
          const raw = readFileSync(fgosPath, "utf-8");
          const data = JSON.parse(raw);

          // Extract curriculum overview from FGOS
          const overview: Record<string, unknown> = {
            subject: SUBJECT_NAMES[subject],
            source: "ФГОС",
          };

          for (const [grade, gradeData] of Object.entries(data.grades || {})) {
            const gd = gradeData as {
              hours_per_week: number;
              total_hours_per_year: number;
              sections: Array<{ name: string; hours: number }>;
            };
            overview[`grade_${grade}`] = {
              hours_per_week: gd.hours_per_week,
              total_hours: gd.total_hours_per_year,
              sections: gd.sections?.map((s: { name: string; hours: number }) => ({
                name: s.name,
                hours: s.hours,
              })),
            };
          }

          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(overview, null, 2),
              },
            ],
          };
        } catch {
          return {
            contents: [
              {
                uri,
                mimeType: "text/plain",
                text: `Данные программы для ${SUBJECT_NAMES[subject]} не найдены.`,
              },
            ],
          };
        }
      }

      const raw = readFileSync(filePath, "utf-8");
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: raw,
          },
        ],
      };
    });
  }
}
