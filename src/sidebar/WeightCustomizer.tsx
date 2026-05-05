import React from "react";
import type { WeightLevel, UserWeights } from "../types";
import { SENSITIVE_PENALTIES } from "../utils/scoreCalculator";
import { WEIGHT_LABELS, WEIGHT_LEVEL_NAMES, WEIGHT_MULTIPLIERS, DEFAULT_WEIGHTS, saveWeights } from "../utils/userWeights";

interface WeightCustomizerProps {
  weights: UserWeights;
  onChange: (weights: UserWeights) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  "sells user data": "Sells user data",
  "biometric data collected": "Biometric data",
  "precise location tracked": "Location tracking",
  "health data collected": "Health data",
  "no data deletion option": "No deletion option",
  "third-party advertising": "3rd-party advertising",
  "indefinite data retention": "Data retention period",
  "children's data collected": "Children's data"
};

const LEVEL_COLORS: Record<WeightLevel, { active: string; inactive: string }> = {
  normal: {
    active: "bg-slate-600 text-white border-slate-600",
    inactive: "border-slate-300 text-slate-500 hover:bg-slate-50"
  },
  important: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "border-amber-400 text-amber-600 hover:bg-amber-50"
  },
  critical: {
    active: "bg-red-600 text-white border-red-600",
    inactive: "border-red-300 text-red-600 hover:bg-red-50"
  }
};

export const WeightCustomizer: React.FC<WeightCustomizerProps> = ({ weights, onChange }) => {
  const handleChange = (key: string, level: WeightLevel) => {
    const next = { ...weights, [key]: level };
    onChange(next);
    void saveWeights(next);
  };

  const handleReset = () => {
    const defaults = { ...DEFAULT_WEIGHTS };
    onChange(defaults);
    void saveWeights(defaults);
  };

  const hasCustomWeights = Object.entries(weights).some(([, v]) => v !== "normal");

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900">
        Customize scoring priorities
        {hasCustomWeights && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700">
            Custom
          </span>
        )}
      </summary>

      <p className="mt-2 text-xs text-slate-500">
        Mark categories as more important to penalize them more heavily. Changes apply to the score
        instantly without re-analyzing.
      </p>

      <div className="mt-2 flex items-center gap-3 text-xs text-slate-400">
        {(["normal", "important", "critical"] as WeightLevel[]).map((lvl) => (
          <span key={lvl}>
            <span
              className={`inline-block rounded border px-1 font-medium ${
                lvl === "critical"
                  ? "border-red-300 text-red-600"
                  : lvl === "important"
                  ? "border-amber-400 text-amber-600"
                  : "border-slate-300 text-slate-500"
              }`}
            >
              {WEIGHT_LABELS[lvl]}
            </span>
            {" "}= {WEIGHT_LEVEL_NAMES[lvl]} (×{WEIGHT_MULTIPLIERS[lvl]})
          </span>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {Object.keys(SENSITIVE_PENALTIES).map((key) => {
          const level = weights[key] ?? "normal";
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                {CATEGORY_LABELS[key] ?? key}
              </span>
              <div className="flex shrink-0 gap-1">
                {(["normal", "important", "critical"] as WeightLevel[]).map((lvl) => {
                  const active = level === lvl;
                  const colors = LEVEL_COLORS[lvl];
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => handleChange(key, lvl)}
                      title={`${WEIGHT_LEVEL_NAMES[lvl]} — ×${WEIGHT_MULTIPLIERS[lvl]} penalty`}
                      className={`rounded border px-1.5 py-0.5 text-xs font-medium transition-colors ${
                        active ? colors.active : colors.inactive
                      }`}
                    >
                      {WEIGHT_LABELS[lvl]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hasCustomWeights && (
        <button
          type="button"
          onClick={handleReset}
          className="mt-3 text-xs text-slate-400 underline hover:text-slate-600"
        >
          Reset to defaults
        </button>
      )}
    </details>
  );
};
