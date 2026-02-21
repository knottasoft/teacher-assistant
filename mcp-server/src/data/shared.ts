import russianData from "./fgos/russian.json" with { type: "json" };
import mathData from "./fgos/math.json" with { type: "json" };
import physicsData from "./fgos/physics.json" with { type: "json" };
import literatureData from "./fgos/literature.json" with { type: "json" };

export interface Topic {
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

export interface Section {
  name: string;
  hours: number;
  topics: Topic[];
}

export interface GradeData {
  level: string;
  hours_per_week: number;
  total_hours_per_year: number;
  sections: Section[];
  control_works: Record<string, unknown>;
  [key: string]: unknown;
}

export interface FgosData {
  subject: string;
  subject_id: string;
  grades: Record<string, GradeData>;
  [key: string]: unknown;
}

export const SUBJECTS = ["russian", "math", "physics", "literature"] as const;

export const SUBJECT_NAMES: Record<string, string> = {
  russian: "Русский язык",
  math: "Математика",
  physics: "Физика",
  literature: "Литература",
};

export const SUBJECT_ALIASES: Record<string, string> = {
  "русский": "russian",
  "русский язык": "russian",
  "математика": "math",
  "алгебра": "math",
  "геометрия": "math",
  "физика": "physics",
  "литература": "literature",
};

export const FGOS_DATA: Record<string, FgosData> = {
  russian: russianData as unknown as FgosData,
  math: mathData as unknown as FgosData,
  physics: physicsData as unknown as FgosData,
  literature: literatureData as unknown as FgosData,
};

export function resolveSubject(input: string): string {
  const lower = input.toLowerCase().trim();
  return SUBJECT_ALIASES[lower] || lower;
}
