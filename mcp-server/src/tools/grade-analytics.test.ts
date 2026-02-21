import { describe, it, expect } from "vitest";

// Test grade analytics logic directly
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

function calculateAverage(grades: number[]): number {
  if (grades.length === 0) return 0;
  return (
    Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 100) / 100
  );
}

describe("grade analytics — CSV parsing", () => {
  it("parses standard CSV", () => {
    const csv = `Ученик,Оценка1,Оценка2,Оценка3
Иванов,5,4,5
Петров,3,3,4
Сидоров,2,3,2`;

    const entries = parseCSV(csv);
    expect(entries).toHaveLength(3);
    expect(entries[0].student).toBe("Иванов");
    expect(entries[0].grades).toEqual([5, 4, 5]);
  });

  it("handles quoted names", () => {
    const csv = `Ученик,Оценка
"Иванов Иван",5`;
    const entries = parseCSV(csv);
    expect(entries[0].student).toBe("Иванов Иван");
  });

  it("filters invalid grades", () => {
    const csv = `Ученик,Оценка
Иванов,5,0,6,abc,3`;
    const entries = parseCSV(csv);
    expect(entries[0].grades).toEqual([5, 3]);
  });

  it("returns empty for header-only CSV", () => {
    const csv = `Ученик,Оценка`;
    expect(parseCSV(csv)).toHaveLength(0);
  });
});

describe("grade analytics — calculations", () => {
  it("calculates average correctly", () => {
    expect(calculateAverage([5, 4, 5])).toBe(4.67);
    expect(calculateAverage([3, 3, 4])).toBe(3.33);
    expect(calculateAverage([5])).toBe(5);
    expect(calculateAverage([])).toBe(0);
  });

  it("quality metric — students with avg >= 3.5", () => {
    const entries: GradeEntry[] = [
      { student: "A", grades: [5, 5, 4] }, // avg 4.67 ✓
      { student: "B", grades: [3, 3, 4] }, // avg 3.33 ✗
      { student: "C", grades: [4, 4, 4] }, // avg 4.00 ✓
      { student: "D", grades: [2, 3, 3] }, // avg 2.67 ✗
    ];

    const averages = entries.map((e) => calculateAverage(e.grades));
    const quality = averages.filter((a) => a >= 3.5).length;
    expect(quality).toBe(2);
    expect(Math.round((quality / entries.length) * 100)).toBe(50);
  });

  it("success rate — students with avg >= 2.5", () => {
    const entries: GradeEntry[] = [
      { student: "A", grades: [5, 5] }, // 5.0 ✓
      { student: "B", grades: [3, 3] }, // 3.0 ✓
      { student: "C", grades: [2, 2] }, // 2.0 ✗
    ];

    const averages = entries.map((e) => calculateAverage(e.grades));
    const success = averages.filter((a) => a >= 2.5).length;
    expect(success).toBe(2);
  });

  it("distribution counts grades correctly", () => {
    const allGrades = [5, 5, 4, 4, 4, 3, 3, 2];
    const dist: Record<string, number> = { "5": 0, "4": 0, "3": 0, "2": 0 };

    for (const g of allGrades) {
      if (g >= 5) dist["5"]++;
      else if (g >= 4) dist["4"]++;
      else if (g >= 3) dist["3"]++;
      else dist["2"]++;
    }

    expect(dist).toEqual({ "5": 2, "4": 3, "3": 2, "2": 1 });
  });
});
