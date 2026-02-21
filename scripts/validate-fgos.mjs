#!/usr/bin/env node

/**
 * Validates FGOS JSON data files against the schema.
 * Lightweight validation without external dependencies.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "mcp-server", "src", "data", "fgos");

const REQUIRED_SUBJECTS = ["russian", "math", "physics", "literature"];

const GRADE_RANGES = {
  russian: [5, 6, 7, 8, 9, 10, 11],
  math: [5, 6, 7, 8, 9, 10, 11],
  physics: [7, 8, 9, 10, 11],
  literature: [5, 6, 7, 8, 9, 10, 11],
};

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(`  ERROR: ${msg}`);
  errors++;
}

function warn(msg) {
  console.warn(`  WARN:  ${msg}`);
  warnings++;
}

function ok(msg) {
  console.log(`  OK:    ${msg}`);
}

console.log("Validating FGOS data files...\n");

for (const subject of REQUIRED_SUBJECTS) {
  const filePath = join(DATA_DIR, `${subject}.json`);
  console.log(`[${subject}]`);

  let data;
  try {
    const raw = readFileSync(filePath, "utf-8");
    data = JSON.parse(raw);
    ok(`File parses as valid JSON`);
  } catch (e) {
    error(`Failed to read/parse ${subject}.json: ${e.message}`);
    continue;
  }

  // Top-level fields
  if (data.subject && typeof data.subject === "string") {
    ok(`subject: "${data.subject}"`);
  } else {
    error(`Missing or invalid 'subject' field`);
  }

  if (data.subject_id === subject) {
    ok(`subject_id: "${data.subject_id}"`);
  } else {
    error(`subject_id should be "${subject}", got "${data.subject_id}"`);
  }

  // Grades
  const expectedGrades = GRADE_RANGES[subject];
  for (const grade of expectedGrades) {
    const gradeData = data.grades?.[String(grade)];
    if (!gradeData) {
      error(`Missing grade ${grade}`);
      continue;
    }

    // Level
    if (!["ООО", "СОО"].includes(gradeData.level)) {
      error(`Grade ${grade}: invalid level "${gradeData.level}" (expected ООО or СОО)`);
    }

    // Hours
    if (typeof gradeData.hours_per_week !== "number" || gradeData.hours_per_week < 1) {
      error(`Grade ${grade}: invalid hours_per_week`);
    }

    if (typeof gradeData.total_hours_per_year !== "number" || gradeData.total_hours_per_year < 34) {
      error(`Grade ${grade}: invalid total_hours_per_year`);
    }

    // Sections
    if (!Array.isArray(gradeData.sections) || gradeData.sections.length === 0) {
      error(`Grade ${grade}: missing or empty sections`);
      continue;
    }

    let sectionHours = 0;
    for (const section of gradeData.sections) {
      if (!section.name) error(`Grade ${grade}: section missing name`);
      if (!section.hours || section.hours < 1) error(`Grade ${grade}, "${section.name}": invalid hours`);
      sectionHours += section.hours || 0;

      if (!Array.isArray(section.topics) || section.topics.length === 0) {
        error(`Grade ${grade}, "${section.name}": missing or empty topics`);
        continue;
      }

      for (const topic of section.topics) {
        if (!topic.name) error(`Grade ${grade}, "${section.name}": topic missing name`);
        if (!topic.hours || topic.hours < 1) error(`Grade ${grade}, "${topic.name}": invalid hours`);

        // Planned results
        const pr = topic.planned_results;
        if (!pr) {
          error(`Grade ${grade}, "${topic.name}": missing planned_results`);
        } else {
          if (!Array.isArray(pr.subject) || pr.subject.length === 0) error(`Grade ${grade}, "${topic.name}": empty planned_results.subject`);
          if (!Array.isArray(pr.meta) || pr.meta.length === 0) error(`Grade ${grade}, "${topic.name}": empty planned_results.meta`);
          if (!Array.isArray(pr.personal) || pr.personal.length === 0) error(`Grade ${grade}, "${topic.name}": empty planned_results.personal`);
        }

        // UUD
        const uud = topic.uud;
        if (!uud) {
          error(`Grade ${grade}, "${topic.name}": missing uud`);
        } else {
          for (const type of ["cognitive", "regulative", "communicative", "personal"]) {
            if (!Array.isArray(uud[type]) || uud[type].length === 0) {
              error(`Grade ${grade}, "${topic.name}": empty uud.${type}`);
            }
          }
        }

        // Control types
        if (!Array.isArray(topic.control_types)) {
          error(`Grade ${grade}, "${topic.name}": missing control_types`);
        }
      }
    }

    // Check hours alignment
    const diff = Math.abs(sectionHours - gradeData.total_hours_per_year);
    const tolerance = gradeData.total_hours_per_year * 0.3;
    if (diff > tolerance) {
      warn(`Grade ${grade}: section hours (${sectionHours}) differ from total (${gradeData.total_hours_per_year}) by ${diff}h`);
    }
  }

  ok(`Checked ${expectedGrades.length} grades\n`);
}

console.log("========================================");
if (errors > 0) {
  console.error(`FAILED: ${errors} error(s), ${warnings} warning(s)`);
  process.exit(1);
} else {
  console.log(`PASSED: 0 errors, ${warnings} warning(s)`);
  console.log(`Validated ${REQUIRED_SUBJECTS.length} subjects`);
}
