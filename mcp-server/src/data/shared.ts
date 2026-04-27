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

export const SUBJECTS = ["literature"] as const;

export const SUBJECT_NAMES: Record<string, string> = {
  literature: "Литература",
};

export const SUBJECT_ALIASES: Record<string, string> = {
  "литература": "literature",
};

export const FGOS_DATA: Record<string, FgosData> = {
  literature: literatureData as unknown as FgosData,
};

export function resolveSubject(input: string): string {
  const lower = input.toLowerCase().trim();
  return SUBJECT_ALIASES[lower] || lower;
}
