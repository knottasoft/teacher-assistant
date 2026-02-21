import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import russianData from "../data/fgos/russian.json" with { type: "json" };
import mathData from "../data/fgos/math.json" with { type: "json" };
import physicsData from "../data/fgos/physics.json" with { type: "json" };
import literatureData from "../data/fgos/literature.json" with { type: "json" };

const SUBJECTS = ["russian", "math", "physics", "literature"] as const;
const SUBJECT_NAMES: Record<string, string> = {
  russian: "Русский язык",
  math: "Математика",
  physics: "Физика",
  literature: "Литература",
};

const FGOS_DATA: Record<
  string,
  {
    grades?: Record<
      string,
      {
        hours_per_week: number;
        total_hours_per_year: number;
        sections?: Array<{ name: string; hours: number }>;
      }
    >;
  }
> = {
  russian: russianData,
  math: mathData,
  physics: physicsData,
  literature: literatureData,
};

export function registerCurriculumResources(server: McpServer): void {
  for (const subject of SUBJECTS) {
    const uri = `curriculum://${subject}`;
    const name = `Программа: ${SUBJECT_NAMES[subject]}`;

    server.resource(uri, name, async () => {
      const data = FGOS_DATA[subject];

      if (!data?.grades) {
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

      const overview: Record<string, unknown> = {
        subject: SUBJECT_NAMES[subject],
        source: "ФГОС",
      };

      for (const [grade, gradeData] of Object.entries(data.grades)) {
        overview[`grade_${grade}`] = {
          hours_per_week: gradeData.hours_per_week,
          total_hours: gradeData.total_hours_per_year,
          sections: gradeData.sections?.map((s) => ({
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
    });
  }
}
