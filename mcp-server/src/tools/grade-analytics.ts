import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";

interface GradeEntry {
  student: string;
  grades: number[];
}

function parseCSV(content: string): GradeEntry[] {
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const entries: GradeEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",").map((s) => s.trim());
    if (parts.length < 2) continue;

    const student = parts[0].replace(/"/g, "");
    const grades = parts
      .slice(1)
      .map((g) => parseInt(g, 10))
      .filter((g) => !isNaN(g) && g >= 1 && g <= 5);

    if (grades.length > 0) {
      entries.push({ student, grades });
    }
  }

  return entries;
}

function parseJSON(content: string): GradeEntry[] {
  const data = JSON.parse(content);
  if (Array.isArray(data)) {
    return data.map((item: { student?: string; name?: string; grades?: number[] }) => ({
      student: item.student || item.name || "Неизвестный",
      grades: (item.grades || []).filter(
        (g: number) => typeof g === "number" && g >= 1 && g <= 5
      ),
    }));
  }
  return [];
}

function calculateAverage(grades: number[]): number {
  if (grades.length === 0) return 0;
  return Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100;
}

export function registerGradeAnalyticsTool(server: McpServer): void {
  server.tool(
    "grade_analytics",
    "Статистический анализ оценок: средний балл, качество знаний, успеваемость, выявление учеников, нуждающихся в поддержке.",
    {
      data_path: z.string().describe("Путь к файлу с оценками (CSV или JSON)"),
      metrics: z
        .array(z.enum(["average", "quality", "success_rate", "distribution", "students_at_risk", "top_students"]))
        .optional()
        .describe("Метрики: average, quality, success_rate, distribution, students_at_risk, top_students"),
    },
    async ({ data_path, metrics }) => {
      if (!existsSync(data_path)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ошибка: файл "${data_path}" не найден.`,
            },
          ],
        };
      }

      const content = readFileSync(data_path, "utf-8");
      let entries: GradeEntry[];

      try {
        if (data_path.endsWith(".json")) {
          entries = parseJSON(content);
        } else {
          entries = parseCSV(content);
        }
      } catch (e) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Ошибка при чтении файла: ${e instanceof Error ? e.message : String(e)}. Формат: CSV (ФИО,оценка1,оценка2,...) или JSON ([{student, grades}]).`,
            },
          ],
        };
      }

      if (entries.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Не найдено данных об оценках в файле.",
            },
          ],
        };
      }

      const allMetrics = metrics || [
        "average",
        "quality",
        "success_rate",
        "distribution",
        "students_at_risk",
        "top_students",
      ];

      const allGrades = entries.flatMap((e) => e.grades);
      const studentAverages = entries.map((e) => ({
        student: e.student,
        average: calculateAverage(e.grades),
        count: e.grades.length,
      }));

      const result: Record<string, unknown> = {
        total_students: entries.length,
        total_grades: allGrades.length,
      };

      if (allMetrics.includes("average")) {
        const classAvg = calculateAverage(allGrades);
        result.average = {
          class_average: classAvg,
          per_student: studentAverages.map((s) => ({
            student: s.student,
            average: s.average,
          })),
        };
      }

      if (allMetrics.includes("quality")) {
        // Качество знаний = % учеников со средним баллом >= 3.5 (на 4 и 5)
        const qualityCount = studentAverages.filter(
          (s) => s.average >= 3.5
        ).length;
        result.quality = {
          percentage: Math.round((qualityCount / entries.length) * 100),
          description: `${qualityCount} из ${entries.length} учеников учатся на 4 и 5`,
        };
      }

      if (allMetrics.includes("success_rate")) {
        // Успеваемость = % учеников без двоек (средний >= 2.5)
        const successCount = studentAverages.filter(
          (s) => s.average >= 2.5
        ).length;
        result.success_rate = {
          percentage: Math.round((successCount / entries.length) * 100),
          description: `${successCount} из ${entries.length} учеников успевают (без двоек)`,
        };
      }

      if (allMetrics.includes("distribution")) {
        const dist: Record<string, number> = { "5": 0, "4": 0, "3": 0, "2": 0 };
        for (const g of allGrades) {
          if (g >= 5) dist["5"]++;
          else if (g >= 4) dist["4"]++;
          else if (g >= 3) dist["3"]++;
          else dist["2"]++;
        }
        result.distribution = dist;
      }

      if (allMetrics.includes("students_at_risk")) {
        result.students_at_risk = studentAverages
          .filter((s) => s.average < 3.0)
          .map((s) => ({
            student: s.student,
            average: s.average,
            recommendation: "Требуется дополнительная работа и индивидуальный подход",
          }));
      }

      if (allMetrics.includes("top_students")) {
        result.top_students = studentAverages
          .filter((s) => s.average >= 4.5)
          .sort((a, b) => b.average - a.average)
          .map((s) => ({
            student: s.student,
            average: s.average,
            recommendation: "Рекомендуется участие в олимпиадах и конкурсах",
          }));
      }

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
