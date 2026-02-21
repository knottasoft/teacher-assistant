import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Topic {
  name: string;
  hours: number;
  planned_results: {
    subject: string[];
    meta: string[];
    personal: string[];
  };
  uud: {
    cognitive: string[];
    regulative: string[];
    communicative: string[];
    personal: string[];
  };
  control_types: string[];
  [key: string]: unknown;
}

interface Section {
  name: string;
  hours: number;
  topics: Topic[];
}

interface GradeData {
  level: string;
  hours_per_week: number;
  total_hours_per_year: number;
  sections: Section[];
  control_works: Record<string, unknown>;
  [key: string]: unknown;
}

interface FgosData {
  subject: string;
  subject_id: string;
  grades: Record<string, GradeData>;
  [key: string]: unknown;
}

const SUBJECT_FILES: Record<string, string> = {
  russian: "russian.json",
  math: "math.json",
  physics: "physics.json",
  literature: "literature.json",
};

const SUBJECT_ALIASES: Record<string, string> = {
  "русский": "russian",
  "русский язык": "russian",
  "математика": "math",
  "алгебра": "math",
  "геометрия": "math",
  "физика": "physics",
  "литература": "literature",
};

function resolveSubject(input: string): string {
  const lower = input.toLowerCase().trim();
  return SUBJECT_ALIASES[lower] || lower;
}

function loadFgosData(subjectId: string): FgosData | null {
  const filename = SUBJECT_FILES[subjectId];
  if (!filename) return null;

  const filePath = join(__dirname, "..", "data", "fgos", filename);
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as FgosData;
  } catch {
    return null;
  }
}

export function registerFgosLookupTool(server: McpServer): void {
  server.tool(
    "fgos_lookup",
    "Поиск требований ФГОС по предмету, классу и теме. Возвращает разделы программы, планируемые результаты, УУД и виды контроля.",
    {
      subject: z.string().describe("Предмет (русский, математика, физика, литература)"),
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
              text: `Ошибка: предмет "${subject}" не найден. Доступные предметы: русский, математика, физика, литература.`,
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
        // Return full grade data if no matches
        sections = gradeData.sections;
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
