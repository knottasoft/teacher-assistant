import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SUBJECTS, SUBJECT_NAMES, FGOS_DATA } from "../data/shared.js";

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
