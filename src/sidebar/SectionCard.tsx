import React, { useMemo } from "react";
import type { PolicySection } from "../types";

interface SectionCardProps extends PolicySection {}

const sensitivityClasses: Record<PolicySection["sensitivity"], string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-green-100 text-green-800 border-green-200"
};

const labelMap: Record<PolicySection["sensitivity"], string> = {
  high: "High Sensitivity",
  medium: "Medium Sensitivity",
  low: "Low Sensitivity"
};

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  short_summary,
  full_summary,
  sensitivity,
  flags
}) => {
  const badgeClass = useMemo(() => sensitivityClasses[sensitivity], [sensitivity]);

  return (
    <details className="group rounded-lg border border-slate-200 bg-white p-3 shadow-sm open:shadow-md">
      <summary className="list-none cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-700">{short_summary}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
              {labelMap[sensitivity]}
            </span>
            <span className="text-xs text-slate-500 transition-transform group-open:rotate-180">▾</span>
          </div>
        </div>
      </summary>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-xs leading-relaxed text-slate-700">{full_summary}</p>
        {flags.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
            {flags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
};
