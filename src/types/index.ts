export interface PolicySection {
  title: string;
  short_summary: string;
  full_summary: string;
  sensitivity: "high" | "medium" | "low";
  flags: string[];
}

export interface AnalysisResult {
  out_of_scope: boolean;
  sections: PolicySection[];
  sensitive_flags: string[];
  nonsensitive_flags: string[];
}

export interface ScoreBreakdownItem {
  label: string;
  impact: number;
  reason: string;
  weightMultiplier?: number;
}

export interface ScoredResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  breakdown: ScoreBreakdownItem[];
}

export type WeightLevel = "normal" | "important" | "critical";

// Maps each canonical penalty key → how much the user cares about it.
export type UserWeights = Record<string, WeightLevel>;

export interface AnalyzePolicyMessage {
  type: "ANALYZE_POLICY";
  text: string;
  pageUrl?: string;
  pageTitle?: string;
  policySignalDetected?: boolean;
}

export interface AnalysisResultMessage {
  type: "ANALYSIS_RESULT";
  payload: AnalysisResult;
}
