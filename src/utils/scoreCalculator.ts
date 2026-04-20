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

// Keyword aliases for each canonical key.
// Checked against the lowercase flag string the AI returns.
const SENSITIVE_KEYWORDS: Record<string, string[]> = {
  "sells user data":           ["sell", "sold to third", "data broker", "monetize"],
  "biometric data collected":  ["biometric", "fingerprint", "face recognition", "facial"],
  "precise location tracked":  ["location", "gps", "geolocation"],
  "health data collected":     ["health data", "medical", "wellness", "fitness data"],
  "no data deletion option":   ["no deletion", "cannot delete", "can't delete", "delet", "erasure"],
  "third-party advertising":   ["advertis", "ad partner", "marketing partner", "ad network", "targeted ad"],
  "indefinite data retention": ["retention", "retain", "indefinite", "as long as"],
  "children's data collected": ["children", "child", "minor", "coppa", "under 13"]
};

const NONSENSITIVE_KEYWORDS: Record<string, string[]> = {
  "right to delete":     ["right to delet", "right to eras", "right to remov", "delete your data", "request deletion"],
  "data not sold":       ["not sold", "do not sell", "don't sell", "never sell", "data not sold"],
  "encryption mentioned":["encrypt", "tls", "ssl", "in transit", "at rest"],
  "opt-out available":   ["opt-out", "opt out", "unsubscribe", "withdraw consent", "object to"]
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

// Match a flag string against keyword aliases for each canonical key.
const findPenaltyEntry = (flag: string): [string, number] | null => {
  const lower = flag.toLowerCase();
  for (const [key, keywords] of Object.entries(SENSITIVE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return [key, SENSITIVE_PENALTIES[key]];
    }
  }
  return null;
};

const findBonusEntry = (flag: string): [string, number] | null => {
  const lower = flag.toLowerCase();
  for (const [key, keywords] of Object.entries(NONSENSITIVE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return [key, NONSENSITIVE_BONUSES[key]];
    }
  }
  return null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getGrade = (score: number): ScoredResult["grade"] => {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 55) return "C";
  if (score >= 35) return "D";
  return "F";
};

export interface ScoreCalculation {
  rawDeductions: number;
  rawAdditions: number;
  effectiveAdditions: number;
}

export const calculateScore = (analysis: AnalysisResult): ScoredResult & { calculation: ScoreCalculation } => {
  const breakdown: ScoreBreakdownItem[] = [];
  const seenPenaltyKeys = new Set<string>();
  const seenBonusKeys = new Set<string>();
  let deductions = 0;
  let additions = 0;

  for (const flag of analysis.sensitive_flags) {
    const entry = findPenaltyEntry(flag);
    if (!entry) continue;
    const [key, impact] = entry;
    // Deduplicate: don't apply the same canonical penalty twice
    if (seenPenaltyKeys.has(key)) continue;
    seenPenaltyKeys.add(key);
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
    if (!entry) continue;
    const [key, impact] = entry;
    // Deduplicate
    if (seenBonusKeys.has(key)) continue;
    seenBonusKeys.add(key);
    additions += impact;
    breakdown.push({
      label: flag,
      impact,
      reason: NONSENSITIVE_REASONS[key] ?? "Privacy-positive practice detected."
    });
  }

  // Bonuses can offset at most half of the deductions.
  // This ensures any penalty always produces a net reduction in the final score.
  const effectiveAdditions = deductions > 0 ? Math.min(additions, Math.floor(deductions / 2)) : 0;
  const score = clamp(100 - deductions + effectiveAdditions, 0, 100);

  return {
    score,
    grade: getGrade(score),
    breakdown,
    calculation: { rawDeductions: deductions, rawAdditions: additions, effectiveAdditions }
  };
};

