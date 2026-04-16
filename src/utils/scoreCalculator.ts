import type { AnalysisResult, ScoredResult, ScoreBreakdownItem } from "../types";

export const SENSITIVE_PENALTIES: Record<string, number> = {
  "sells user data": 25,
  "biometric data collected": 20,
  "precise location tracked": 15,
  "health data collected": 15,
  "no data deletion option": 15,
  "third-party advertising": 10,
  "indefinite data retention": 10,
  "children's data collected": 10
};

export const NONSENSITIVE_BONUSES: Record<string, number> = {
  "right to delete": 10,
  "data not sold": 10,
  "encryption mentioned": 5,
  "opt-out available": 5
};

const SENSITIVE_REASONS: Record<string, string> = {
  "sells user data": "Selling user data is a major privacy risk.",
  "biometric data collected": "Biometric identifiers are highly sensitive data.",
  "precise location tracked": "Persistent location tracking increases surveillance risk.",
  "health data collected": "Health data can expose deeply personal information.",
  "no data deletion option": "No deletion pathway reduces user control over personal data.",
  "third-party advertising": "Advertising data sharing broadens data exposure.",
  "indefinite data retention": "Indefinite retention increases long-term breach impact.",
  "children's data collected": "Collecting children's data creates elevated legal and ethical risk."
};

const NONSENSITIVE_REASONS: Record<string, string> = {
  "right to delete": "Deletion rights improve user control and legal alignment.",
  "data not sold": "Not selling data meaningfully reduces third-party exposure.",
  "encryption mentioned": "Encryption reduces risk if data is intercepted or breached.",
  "opt-out available": "Opt-out controls allow users to limit data processing."
};

// Case-insensitive substring match against our known penalty/bonus keys.
// The AI may return free-form strings; we match them against canonical keys.
const findPenaltyEntry = (flag: string): [string, number] | null => {
  const lower = flag.toLowerCase();
  for (const entry of Object.entries(SENSITIVE_PENALTIES)) {
    if (lower.includes(entry[0])) return entry;
  }
  return null;
};

const findBonusEntry = (flag: string): [string, number] | null => {
  const lower = flag.toLowerCase();
  for (const entry of Object.entries(NONSENSITIVE_BONUSES)) {
    if (lower.includes(entry[0])) return entry;
  }
  return null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getGrade = (score: number): ScoredResult["grade"] => {
  if (score >= 90) {
    return "A";
  }
  if (score >= 75) {
    return "B";
  }
  if (score >= 55) {
    return "C";
  }
  if (score >= 35) {
    return "D";
  }
  return "F";
};

export const calculateScore = (analysis: AnalysisResult): ScoredResult => {
  const breakdown: ScoreBreakdownItem[] = [];
  let deductions = 0;
  let additions = 0;

  for (const flag of analysis.sensitive_flags) {
    const entry = findPenaltyEntry(flag);
    if (!entry) {
      continue;
    }
    const [key, impact] = entry;
    deductions += impact;
    breakdown.push({
      label: flag,
      impact: -impact,
      reason: SENSITIVE_REASONS[key] ?? "Sensitive data practice detected."
    });
  }

  deductions = Math.min(deductions, 80);

  for (const flag of analysis.nonsensitive_flags) {
    const entry = findBonusEntry(flag);
    if (!entry) {
      continue;
    }
    const [key, impact] = entry;
    additions += impact;
    breakdown.push({
      label: flag,
      impact,
      reason: NONSENSITIVE_REASONS[key] ?? "Privacy-positive practice detected."
    });
  }

  const score = clamp(100 + additions - deductions, 0, 100);

  return {
    score,
    grade: getGrade(score),
    breakdown
  };
};
