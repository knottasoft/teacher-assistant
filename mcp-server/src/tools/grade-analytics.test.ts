import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseGradesText, parseGradesBuffer, parseJsonContent, parseCsv,
  detectDelimiter, classifyCell, looksLikeStudentName, decodeBuffer,
  extractMetadata, calculateAverage,
} from "./grade-analytics.js";

const FIXTURES = join(__dirname, "..", "..", "test-fixtures", "grades");

// =========================================================================
// Real-fixture: rich МЭШ-style export from grades_8b_literature_q2_full.csv
//
// Эталон из артефакты/grades/отчёт_успеваемость_8Б.md:
//   total_students: 25, total_grades: 334
//   class_average:  3.22 (округлённо)
//   distribution:   5:32, 4:91, 3:129, 2:82
//   quality:        32% (8 из 25 на 4-5)
//   success_rate:   68% (17 из 25 без 2)
// =========================================================================

describe("grade_analytics — real МЭШ-style fixture (8Б)", () => {
  const fixture = readFileSync(join(FIXTURES, "grades_8b_literature_q2_full.csv"));
  const parsed = parseGradesBuffer(fixture, ".csv");

  it("распознал кодировку UTF-8 BOM", () => {
    // BOM strip отрабатывает; warnings содержит примечание
    expect(parsed.warnings.some((w) => /utf-8-bom/i.test(w))).toBe(true);
  });

  it("разделитель = ';'", () => {
    expect(parsed.delimiter).toBe(";");
  });

  it("формат = rich-export", () => {
    expect(parsed.format_hint).toBe("rich-export");
  });

  it("извлёк метаданные класса", () => {
    expect(parsed.metadata).toBeTruthy();
    expect(parsed.metadata?.class).toMatch(/8Б/);
    expect(parsed.metadata?.subject).toMatch(/Литература/);
    expect(parsed.metadata?.teacher).toMatch(/Перекрестова/);
    expect(parsed.metadata?.period).toMatch(/II четверть/);
    expect(parsed.metadata?.school).toMatch(/Малодербетовская|МКОУ/);
    expect(parsed.metadata?.hours_per_week).toBe(2);
    expect(parsed.metadata?.academic_year).toBe("2025-2026");
  });

  it("распарсил 25 учеников", () => {
    expect(parsed.entries.length).toBe(25);
    expect(parsed.entries[0].student).toMatch(/Ученик 8Б-01/);
    expect(parsed.entries[24].student).toMatch(/Ученик 8Б-25/);
  });

  it("распознал колонки с датами и типами работ", () => {
    const datedCols = parsed.columns.filter((c) => c.date);
    expect(datedCols.length).toBeGreaterThanOrEqual(14);
    // первая колонка — 07.11.2025 (Т)
    const first = datedCols[0];
    expect(first.date).toBe("2025-11-07");
    expect(first.work_type).toBe("Т");
    // последняя в датах — 23.12.2025 (ПР)
    const last = datedCols[datedCols.length - 1];
    expect(last.date).toBe("2025-12-23");
    expect(last.work_type).toBe("ПР");
  });

  it("распознал колонку «За II четверть» как is_total", () => {
    const totals = parsed.columns.filter((c) => c.is_total);
    expect(totals.length).toBeGreaterThanOrEqual(1);
    expect(totals.some((t) => /четверть/i.test(t.raw_header ?? ""))).toBe(true);
  });

  it("извлёк темы уроков из второй строки шапки", () => {
    const withTopics = parsed.columns.filter((c) => c.lesson_topic && c.lesson_topic.length > 5);
    expect(withTopics.length).toBeGreaterThan(0);
    expect(withTopics.some((c) => /Капитанская дочка/i.test(c.lesson_topic!))).toBe(true);
    expect(withTopics.some((c) => /Мцыри/i.test(c.lesson_topic!))).toBe(true);
  });

  it("общее число числовых отметок = 334 (эталон)", () => {
    const total = parsed.entries.reduce((acc, e) => acc + e.grades.length, 0);
    expect(total).toBe(334);
  });

  it("средний балл по классу ≈ 3.22 (эталон)", () => {
    const all = parsed.entries.flatMap((e) => e.grades.map((g) => g.value));
    const avg = calculateAverage(all);
    expect(avg).toBeGreaterThanOrEqual(3.20);
    expect(avg).toBeLessThanOrEqual(3.25);
  });

  it("распределение оценок 5:32 4:91 3:129 2:82 (эталон)", () => {
    const all = parsed.entries.flatMap((e) => e.grades.map((g) => g.value));
    const dist = { 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of all) (dist as Record<number, number>)[g]++;
    expect(dist[5]).toBe(32);
    expect(dist[4]).toBe(91);
    expect(dist[3]).toBe(129);
    expect(dist[2]).toBe(82);
  });

  it("засчитал пропуски Н и болезни Б", () => {
    const totalAbs = parsed.entries.reduce((a, e) => a + e.absences, 0);
    const totalIll = parsed.entries.reduce((a, e) => a + e.illnesses, 0);
    expect(totalAbs).toBeGreaterThan(0);
    expect(totalIll).toBeGreaterThan(0);
  });

  it("ни один ученик не помечен not_attested (у всех есть отметки)", () => {
    expect(parsed.entries.every((e) => !e.not_attested)).toBe(true);
  });

  it("прикрепил даты к индивидуальным оценкам", () => {
    const e0 = parsed.entries[1]; // 8Б-02 — отличник, у него все ячейки заполнены
    expect(e0.grades[0].date).toBe("2025-11-07");
    expect(e0.grades[0].work_type).toBe("Т");
    expect(e0.grades[0].lesson_topic).toMatch(/Пушкин|поэт|Пугачёв/i);
  });
});

// =========================================================================
// Period / work_type filtering (на тех же данных, фильтры через parseGrades)
// =========================================================================

describe("grade_analytics — period & work_type filtering", () => {
  const fixture = readFileSync(join(FIXTURES, "grades_8b_literature_q2_full.csv"));
  const parsed = parseGradesBuffer(fixture, ".csv");

  it("фильтр date_from/date_to: декабрь даёт меньше отметок чем вся четверть", () => {
    const decGrades = parsed.entries.flatMap((e) =>
      e.grades.filter((g) => g.date && g.date >= "2025-12-01" && g.date <= "2025-12-31")
    );
    expect(decGrades.length).toBeGreaterThan(0);
    const allGrades = parsed.entries.flatMap((e) => e.grades);
    expect(decGrades.length).toBeLessThan(allGrades.length);
  });

  it("фильтр по типу работ: только КС (классные сочинения)", () => {
    const ksGrades = parsed.entries.flatMap((e) => e.grades.filter((g) => g.work_type === "КС"));
    // в фикстуре 2 КС × 25 учеников = до 50, но кто-то болел/пропустил
    expect(ksGrades.length).toBeGreaterThan(20);
    expect(ksGrades.length).toBeLessThanOrEqual(50);
  });

  it("фильтр по нескольким типам работ: КР+ПР+КС (контроль)", () => {
    const controlTypes = new Set(["КР", "ПР", "КС"]);
    const controlGrades = parsed.entries.flatMap((e) =>
      e.grades.filter((g) => g.work_type && controlTypes.has(g.work_type))
    );
    expect(controlGrades.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// XLSX path — primary user flow («учитель скачал XLSX из ЭлЖур/МЭШ → перетащил»)
// =========================================================================

describe("grade_analytics — XLSX (primary flow)", () => {
  const fixture = readFileSync(join(FIXTURES, "grades_8b_literature_q2_full.xlsx"));
  const parsed = parseGradesBuffer(fixture, ".xlsx");

  it("формат = xlsx", () => {
    expect(parsed.format_hint).toBe("xlsx");
    expect(parsed.delimiter).toBe("xlsx");
  });

  it("извлёк метаданные из XLSX", () => {
    expect(parsed.metadata?.class).toMatch(/8Б/);
    expect(parsed.metadata?.subject).toMatch(/Литература/);
    expect(parsed.metadata?.teacher).toMatch(/Перекрестова/);
    expect(parsed.metadata?.academic_year).toBe("2025-2026");
  });

  it("распарсил 25 учеников из XLSX", () => {
    expect(parsed.entries.length).toBe(25);
  });

  it("число числовых отметок 334 (эталон) — то же что и из CSV", () => {
    const total = parsed.entries.reduce((acc, e) => acc + e.grades.length, 0);
    expect(total).toBe(334);
  });

  it("прикрепил даты + типы работ из XLSX", () => {
    const datedCols = parsed.columns.filter((c) => c.date);
    expect(datedCols.length).toBeGreaterThanOrEqual(14);
    expect(datedCols[0].date).toBe("2025-11-07");
    expect(datedCols[0].work_type).toBe("Т");
  });

  it("XLSX-простой формат тоже работает", () => {
    const simpleBuf = readFileSync(join(FIXTURES, "grades_8b_literature_q2_simple.xlsx"));
    const r = parseGradesBuffer(simpleBuf, ".xlsx");
    expect(r.entries.length).toBe(25);
    const total = r.entries.reduce((acc, e) => acc + e.grades.length, 0);
    expect(total).toBe(334);
  });
});

// =========================================================================
// Simple CSV — backward compatibility
// =========================================================================

describe("grade_analytics — simple CSV (regression)", () => {
  const fixture = readFileSync(join(FIXTURES, "grades_8b_literature_q2_simple.csv"));
  const parsed = parseGradesBuffer(fixture, ".csv");

  it("формат = simple", () => {
    expect(parsed.format_hint).toBe("simple");
  });

  it("распарсил 25 учеников из simple-формата", () => {
    expect(parsed.entries.length).toBe(25);
  });

  it("количество отметок совпадает с full-формой (тот же датасет, без Н/Б)", () => {
    const total = parsed.entries.reduce((a, e) => a + e.grades.length, 0);
    expect(total).toBe(334);
  });

  it("ad-hoc CSV: ФИО,5,4,3,5", () => {
    const csv = `ФИО,Оценка1,Оценка2,Оценка3\nИванов И.,5,4,3\nПетров П.,3,3,4`;
    const r = parseGradesText(csv);
    expect(r.entries.length).toBe(2);
    expect(r.entries[0].grades.map((g) => g.value)).toEqual([5, 4, 3]);
  });
});

// =========================================================================
// JSON regression
// =========================================================================

describe("grade_analytics — JSON regression", () => {
  it("парсит JSON-массив [{student, grades}]", () => {
    const json = JSON.stringify([
      { student: "Иванов", grades: [5, 4, 5] },
      { student: "Петров", grades: [3, 3, 4] },
    ]);
    const r = parseJsonContent(json);
    expect(r.entries.length).toBe(2);
    expect(r.entries[0].grades.map((g) => g.value)).toEqual([5, 4, 5]);
  });

  it("игнорирует невалидные оценки в JSON", () => {
    const json = JSON.stringify([{ student: "X", grades: [5, 0, 6, "abc", 3] }]);
    const r = parseJsonContent(json);
    expect(r.entries[0].grades.map((g) => g.value)).toEqual([5, 3]);
  });
});

// =========================================================================
// Encoding detection
// =========================================================================

describe("grade_analytics — encoding detection", () => {
  it("UTF-8 BOM strip", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const text = Buffer.from("ФИО,5,4\nИванов,5,4", "utf-8");
    const buf = Buffer.concat([bom, text]);
    const { text: decoded, encoding } = decodeBuffer(buf);
    expect(encoding).toBe("utf-8-bom");
    expect(decoded).not.toContain("﻿");
    expect(decoded.startsWith("ФИО")).toBe(true);
  });

  it("plain UTF-8", () => {
    const buf = Buffer.from("ФИО,5,4", "utf-8");
    const { encoding } = decodeBuffer(buf);
    expect(encoding).toBe("utf-8");
  });

  it("Windows-1251 fallback", () => {
    // CP1251 кодировка строки «Иванов,5,4»
    const win1251 = Buffer.concat([
      Buffer.from([0xc8, 0xe2, 0xe0, 0xed, 0xee, 0xe2]), // Иванов
      Buffer.from(",5,4", "ascii"),
    ]);
    const { text, encoding } = decodeBuffer(win1251);
    expect(encoding).toBe("windows-1251");
    expect(text).toContain("Иванов");
  });
});

// =========================================================================
// Low-level units
// =========================================================================

describe("grade_analytics — primitives", () => {
  it("detectDelimiter ; vs , vs tab", () => {
    expect(detectDelimiter("a;b;c\nx;y;z")).toBe(";");
    expect(detectDelimiter("a,b,c\nx,y,z")).toBe(",");
    expect(detectDelimiter("a\tb\tc\nx\ty\tz")).toBe("\t");
  });

  it("classifyCell", () => {
    expect(classifyCell("5").kind).toBe("grade");
    expect(classifyCell("5+").value).toBe(5);
    expect(classifyCell("4-").value).toBe(4);
    expect(classifyCell("4/5").value).toBe(4);
    expect(classifyCell("Н").kind).toBe("absence");
    expect(classifyCell("Б").kind).toBe("illness");
    expect(classifyCell("н/а").kind).toBe("not_attested");
    expect(classifyCell("").kind).toBe("empty");
    expect(classifyCell("Иванов").kind).toBe("other");
  });

  it("looksLikeStudentName", () => {
    expect(looksLikeStudentName("Иванов И.")).toBe(true);
    expect(looksLikeStudentName("Иванов Иван")).toBe(true);
    expect(looksLikeStudentName("Ученик 8Б-01")).toBe(true);
    expect(looksLikeStudentName("5")).toBe(false);
    expect(looksLikeStudentName("Класс:")).toBe(false);
  });

  it("multi-line cells через \\n внутри кавычек", () => {
    const csv = `№;ФИО;"07.11.2025\n(Т)";"11.11.2025\n(Т)"
1;Иванов;5;4`;
    const rows = parseCsv(csv, ";");
    expect(rows.length).toBe(2);
    expect(rows[0][2]).toBe("07.11.2025\n(Т)");
    expect(rows[1][2]).toBe("5");
  });

  it("calculateAverage", () => {
    expect(calculateAverage([5, 4, 5])).toBe(4.67);
    expect(calculateAverage([3, 3, 4])).toBe(3.33);
    expect(calculateAverage([])).toBe(0);
  });

  it("extractMetadata из шапки фикстуры", () => {
    const rows = [
      ["Электронный журнал — выгрузка по предмету"],
      ["Образовательная организация:", "МКОУ «Малодербетовская СОШ»"],
      ["Класс:", "8Б"],
      ["Предмет:", "Литература"],
      ["Учитель:", "Перекрестова Т. Н."],
      ["Период:", "II четверть 2025–2026 уч. года"],
      ["Учебных часов в неделю:", "2"],
    ];
    const meta = extractMetadata(rows);
    expect(meta?.class).toMatch(/8Б/);
    expect(meta?.subject).toBe("Литература");
    expect(meta?.hours_per_week).toBe(2);
    expect(meta?.academic_year).toBe("2025-2026");
  });
});
