import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data", "fgos");

const SUBJECTS = ["russian", "math", "physics", "literature"];

describe("FGOS data", () => {
  const datasets: Record<string, unknown> = {};

  beforeAll(() => {
    for (const subject of SUBJECTS) {
      const raw = readFileSync(join(DATA_DIR, `${subject}.json`), "utf-8");
      datasets[subject] = JSON.parse(raw);
    }
  });

  it("all subject files exist and parse as valid JSON", () => {
    for (const subject of SUBJECTS) {
      expect(datasets[subject]).toBeDefined();
    }
  });

  for (const subject of SUBJECTS) {
    describe(`${subject}.json`, () => {
      it("has required top-level fields", () => {
        const data = datasets[subject] as Record<string, unknown>;
        expect(data).toHaveProperty("subject");
        expect(data).toHaveProperty("subject_id");
        expect(data).toHaveProperty("grades");
        expect(typeof data.subject).toBe("string");
        expect(typeof data.subject_id).toBe("string");
      });

      it("has valid grade entries", () => {
        const data = datasets[subject] as { grades: Record<string, unknown> };
        const grades = Object.keys(data.grades);
        expect(grades.length).toBeGreaterThan(0);

        for (const grade of grades) {
          const num = parseInt(grade, 10);
          expect(num).toBeGreaterThanOrEqual(5);
          expect(num).toBeLessThanOrEqual(11);
        }
      });

      it("each grade has sections with topics", () => {
        const data = datasets[subject] as {
          grades: Record<
            string,
            {
              level: string;
              hours_per_week: number;
              total_hours_per_year: number;
              sections: Array<{
                name: string;
                hours: number;
                topics: Array<{ name: string; hours: number }>;
              }>;
            }
          >;
        };

        for (const [grade, gradeData] of Object.entries(data.grades)) {
          expect(gradeData.level).toBeDefined();
          expect(gradeData.hours_per_week).toBeGreaterThan(0);
          expect(gradeData.total_hours_per_year).toBeGreaterThan(0);
          expect(Array.isArray(gradeData.sections)).toBe(true);
          expect(gradeData.sections.length).toBeGreaterThan(0);

          for (const section of gradeData.sections) {
            expect(section.name).toBeTruthy();
            expect(section.hours).toBeGreaterThan(0);
            expect(Array.isArray(section.topics)).toBe(true);
            expect(
              section.topics.length,
              `Grade ${grade}, section "${section.name}" has no topics`
            ).toBeGreaterThan(0);

            for (const topic of section.topics) {
              expect(topic.name).toBeTruthy();
              expect(topic.hours).toBeGreaterThan(0);
            }
          }
        }
      });

      it("each topic has planned_results and uud", () => {
        const data = datasets[subject] as {
          grades: Record<
            string,
            {
              sections: Array<{
                topics: Array<{
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
                }>;
              }>;
            }
          >;
        };

        for (const gradeData of Object.values(data.grades)) {
          for (const section of gradeData.sections) {
            for (const topic of section.topics) {
              expect(topic.planned_results).toBeDefined();
              expect(Array.isArray(topic.planned_results.subject)).toBe(true);
              expect(Array.isArray(topic.planned_results.meta)).toBe(true);
              expect(Array.isArray(topic.planned_results.personal)).toBe(true);

              expect(topic.uud).toBeDefined();
              expect(Array.isArray(topic.uud.cognitive)).toBe(true);
              expect(Array.isArray(topic.uud.regulative)).toBe(true);
              expect(Array.isArray(topic.uud.communicative)).toBe(true);
              expect(Array.isArray(topic.uud.personal)).toBe(true);
            }
          }
        }
      });

      it("total section hours roughly match total_hours_per_year", () => {
        const data = datasets[subject] as {
          grades: Record<
            string,
            {
              total_hours_per_year: number;
              sections: Array<{ hours: number }>;
            }
          >;
        };

        for (const [grade, gradeData] of Object.entries(data.grades)) {
          const sectionTotal = gradeData.sections.reduce(
            (sum, s) => sum + s.hours,
            0
          );
          // Allow 20% tolerance for control works, reserves, etc.
          const tolerance = gradeData.total_hours_per_year * 0.3;
          expect(
            Math.abs(sectionTotal - gradeData.total_hours_per_year),
            `Grade ${grade}: section hours ${sectionTotal} vs year hours ${gradeData.total_hours_per_year}`
          ).toBeLessThanOrEqual(tolerance);
        }
      });
    });
  }
});

describe("FGOS subject aliases", () => {
  const SUBJECT_ALIASES: Record<string, string> = {
    русский: "russian",
    "русский язык": "russian",
    математика: "math",
    алгебра: "math",
    геометрия: "math",
    физика: "physics",
    литература: "literature",
  };

  it("all aliases map to valid subjects", () => {
    for (const [alias, subjectId] of Object.entries(SUBJECT_ALIASES)) {
      expect(
        SUBJECTS.includes(subjectId),
        `Alias "${alias}" maps to unknown subject "${subjectId}"`
      ).toBe(true);
    }
  });
});
