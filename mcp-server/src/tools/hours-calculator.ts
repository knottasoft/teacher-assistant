import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import russianData from "../data/fgos/russian.json" with { type: "json" };
import mathData from "../data/fgos/math.json" with { type: "json" };
import physicsData from "../data/fgos/physics.json" with { type: "json" };
import literatureData from "../data/fgos/literature.json" with { type: "json" };

const FGOS_DATA: Record<string, { grades?: Record<string, { hours_per_week?: number }> }> = {
  russian: russianData,
  math: mathData,
  physics: physicsData,
  literature: literatureData,
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

// Academic calendar constants (Russia)
const WEEKS_PER_QUARTER: Record<string, number[]> = {
  // [Q1, Q2, Q3, Q4]
  default: [8, 8, 10, 8], // ~34 учебных недели
};

const WEEKS_PER_SEMESTER: Record<string, number[]> = {
  // [S1, S2]
  default: [16, 18],
};

function resolveSubject(input: string): string {
  const lower = input.toLowerCase().trim();
  return SUBJECT_ALIASES[lower] || lower;
}

export function registerHoursCalculatorTool(server: McpServer): void {
  server.tool(
    "hours_calculator",
    "Расчёт учебных часов по предмету, классу и периоду. Учитывает ФГОС нормативы и учебный календарь.",
    {
      subject: z.string().describe("Предмет"),
      grade: z.number().min(5).max(11).describe("Класс"),
      period: z
        .enum(["quarter1", "quarter2", "quarter3", "quarter4", "semester1", "semester2", "year"])
        .describe("Период: quarter1-4, semester1-2, year"),
      hours_per_week: z.number().optional().describe("Часов в неделю (если отличается от стандарта)"),
    },
    async ({ subject, grade, period, hours_per_week }) => {
      const subjectId = resolveSubject(subject);
      let standardHoursPerWeek = hours_per_week;

      if (!standardHoursPerWeek) {
        const data = FGOS_DATA[subjectId];
        if (data) {
          const gradeData = data.grades?.[String(grade)];
          if (gradeData) {
            standardHoursPerWeek = gradeData.hours_per_week;
          }
        }
      }

      if (!standardHoursPerWeek) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Не удалось определить количество часов в неделю для ${subject}, ${grade} класс. Укажите параметр hours_per_week.`,
            },
          ],
        };
      }

      const quarters = WEEKS_PER_QUARTER["default"];
      const semesters = WEEKS_PER_SEMESTER["default"];
      const totalWeeks = quarters.reduce((a, b) => a + b, 0);

      let weeks: number;
      let periodName: string;

      switch (period) {
        case "quarter1":
          weeks = quarters[0];
          periodName = "I четверть";
          break;
        case "quarter2":
          weeks = quarters[1];
          periodName = "II четверть";
          break;
        case "quarter3":
          weeks = quarters[2];
          periodName = "III четверть";
          break;
        case "quarter4":
          weeks = quarters[3];
          periodName = "IV четверть";
          break;
        case "semester1":
          weeks = semesters[0];
          periodName = "I полугодие";
          break;
        case "semester2":
          weeks = semesters[1];
          periodName = "II полугодие";
          break;
        case "year":
          weeks = totalWeeks;
          periodName = "Учебный год";
          break;
        default:
          weeks = totalWeeks;
          periodName = "Учебный год";
      }

      const totalHours = weeks * standardHoursPerWeek;
      const controlWorkHours = Math.max(1, Math.floor(totalHours * 0.1));
      const teachingHours = totalHours - controlWorkHours;

      const result = {
        subject,
        grade,
        period: periodName,
        hours_per_week: standardHoursPerWeek,
        weeks,
        total_hours: totalHours,
        breakdown: {
          teaching_hours: teachingHours,
          control_work_hours: controlWorkHours,
        },
        note: `Расчёт на основе ${standardHoursPerWeek} ч/нед × ${weeks} нед = ${totalHours} ч. Из них ~${controlWorkHours} ч на контрольные мероприятия.`,
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
