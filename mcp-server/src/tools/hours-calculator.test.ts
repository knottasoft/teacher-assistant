import { describe, it, expect } from "vitest";

// Test the hours calculation logic directly
const WEEKS_PER_QUARTER = [8, 8, 10, 8]; // 34 weeks total
const WEEKS_PER_SEMESTER = [16, 18];

function calculateHours(
  hoursPerWeek: number,
  period: string
): { weeks: number; total: number; control: number; teaching: number } {
  let weeks: number;

  switch (period) {
    case "quarter1":
      weeks = WEEKS_PER_QUARTER[0];
      break;
    case "quarter2":
      weeks = WEEKS_PER_QUARTER[1];
      break;
    case "quarter3":
      weeks = WEEKS_PER_QUARTER[2];
      break;
    case "quarter4":
      weeks = WEEKS_PER_QUARTER[3];
      break;
    case "semester1":
      weeks = WEEKS_PER_SEMESTER[0];
      break;
    case "semester2":
      weeks = WEEKS_PER_SEMESTER[1];
      break;
    case "year":
      weeks = WEEKS_PER_QUARTER.reduce((a, b) => a + b, 0);
      break;
    default:
      weeks = WEEKS_PER_QUARTER.reduce((a, b) => a + b, 0);
  }

  const total = weeks * hoursPerWeek;
  const control = Math.max(1, Math.floor(total * 0.1));
  const teaching = total - control;

  return { weeks, total, control, teaching };
}

describe("hours calculator", () => {
  it("calculates year hours correctly for 5h/week", () => {
    const result = calculateHours(5, "year");
    expect(result.weeks).toBe(34);
    expect(result.total).toBe(170);
    expect(result.teaching + result.control).toBe(result.total);
  });

  it("calculates quarter hours correctly", () => {
    const q1 = calculateHours(3, "quarter1");
    expect(q1.weeks).toBe(8);
    expect(q1.total).toBe(24);

    const q3 = calculateHours(3, "quarter3");
    expect(q3.weeks).toBe(10);
    expect(q3.total).toBe(30);
  });

  it("calculates semester hours correctly", () => {
    const s1 = calculateHours(4, "semester1");
    expect(s1.weeks).toBe(16);
    expect(s1.total).toBe(64);
  });

  it("allocates ~10% for control works", () => {
    const result = calculateHours(5, "year");
    expect(result.control).toBe(17); // floor(170 * 0.1) = 17
    expect(result.teaching).toBe(153);
  });

  it("ensures at least 1 control hour even for small periods", () => {
    const result = calculateHours(1, "quarter1");
    expect(result.total).toBe(8);
    expect(result.control).toBeGreaterThanOrEqual(1);
  });

  it("all quarters sum to year total", () => {
    const hw = 3;
    const q1 = calculateHours(hw, "quarter1").total;
    const q2 = calculateHours(hw, "quarter2").total;
    const q3 = calculateHours(hw, "quarter3").total;
    const q4 = calculateHours(hw, "quarter4").total;
    const year = calculateHours(hw, "year").total;

    expect(q1 + q2 + q3 + q4).toBe(year);
  });
});
