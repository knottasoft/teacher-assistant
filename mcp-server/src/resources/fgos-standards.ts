import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SUBJECTS, SUBJECT_NAMES, getGradeData } from "../data/shared.js";

export function registerFgosResources(server: McpServer): void {
  for (const subject of SUBJECTS) {
    const grades = subject === "physics" ? [7, 8, 9, 10, 11] : [5, 6, 7, 8, 9, 10, 11];

    for (const grade of grades) {
      const uri = `fgos://${subject}/${grade}`;
      const name = `ФГОС: ${SUBJECT_NAMES[subject]}, ${grade} класс`;

      server.resource(uri, name, async () => {
        const gradeData = getGradeData(subject, grade);

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
                  ...(gradeData as unknown as Record<string, unknown>),
                },
                null,
                2
              ),
            },
          ],
        };
      });
    }
  }
}
