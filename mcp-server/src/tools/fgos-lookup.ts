import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FGOS_DATA, resolveSubject } from "../data/shared.js";
import type { FgosData } from "../data/shared.js";

function loadFgosData(subjectId: string): FgosData | null {
  return FGOS_DATA[subjectId] || null;
}

export function registerFgosLookupTool(server: McpServer): void {
  server.tool(
    "fgos_lookup",
    "Поиск требований ФГОС по предмету, классу и теме. Возвращает разделы программы, планируемые результаты, УУД и виды контроля.",
    {
      subject: z.string().describe("Предмет (литература)"),
      grade: z.number().min(5).max(11).describe("Класс (5-11)"),
      topic: z.string().optional().describe("Тема для поиска (необязательно)"),
      section: z.string().optional().describe("Раздел программы (необязательно)"),
    },
    async ({ subject, grade, topic, section }) => {
      const subjectId = resolveSubject(subject);
      const data = loadFgosData(subjectId);

      if (!data) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ошибка: предмет "${subject}" не поддерживается. В этой версии плагина доступна только литература.`,
            },
          ],
        };
      }

      const gradeData = data.grades[String(grade)];
      if (!gradeData) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ошибка: данные для ${grade} класса по предмету "${data.subject}" не найдены.`,
            },
          ],
        };
      }

      // Filter by section if specified
      let sections = gradeData.sections;
      if (section) {
        const sectionLower = section.toLowerCase();
        sections = sections.filter((s) =>
          s.name.toLowerCase().includes(sectionLower)
        );
      }

      // Filter by topic if specified
      if (topic) {
        const topicLower = topic.toLowerCase();
        sections = sections
          .map((s) => ({
            ...s,
            topics: s.topics.filter((t) =>
              t.name.toLowerCase().includes(topicLower)
            ),
          }))
          .filter((s) => s.topics.length > 0);
      }

      if (sections.length === 0) {
        // No matches: return a discovery hint instead of dumping the whole grade,
        // which would otherwise blow up the context window.
        const availableSections = gradeData.sections.map((s) => s.name);
        const availableTopics = gradeData.sections.flatMap((s) =>
          s.topics.map((t) => `${s.name} → ${t.name}`)
        );
        const hint = {
          subject: data.subject,
          grade,
          message:
            "Совпадений не найдено. Уточни параметры section/topic из перечня ниже, либо вызови без них для полного списка.",
          query: { topic: topic ?? null, section: section ?? null },
          available_sections: availableSections,
          available_topics: availableTopics,
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(hint, null, 2),
            },
          ],
        };
      }

      const result = {
        subject: data.subject,
        grade,
        level: gradeData.level,
        hours_per_week: gradeData.hours_per_week,
        total_hours_per_year: gradeData.total_hours_per_year,
        sections: sections.map((s) => ({
          name: s.name,
          hours: s.hours,
          topics: s.topics.map((t) => ({
            name: t.name,
            hours: t.hours,
            planned_results: t.planned_results,
            uud: t.uud,
            control_types: t.control_types,
          })),
        })),
        control_works: gradeData.control_works,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
