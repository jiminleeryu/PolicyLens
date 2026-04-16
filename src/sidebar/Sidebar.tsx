import React from "react";
import { DisclaimerBanner } from "./DisclaimerBanner";
import { ScoreGauge } from "./ScoreGauge";
import { SectionCard } from "./SectionCard";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { calculateScore } from "../utils/scoreCalculator";
import type { AnalysisResult } from "../types";

interface SidebarProps {
  analysis: AnalysisResult | null;
  loading: boolean;
  onClose: () => void;
}

const LoadingState: React.FC = () => {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      <p className="font-semibold">Analyzing privacy policy...</p>
      <p className="mt-1 text-xs">PolicyLens is extracting key sections and risk signals.</p>
    </div>
  );
};

const EmptyState: React.FC = () => {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      <p className="font-semibold">Ready to analyze</p>
      <p className="mt-1 text-xs">Click the PolicyLens trigger button to analyze this page.</p>
    </div>
  );
};

const OutOfScopeState: React.FC = () => {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-100 p-4 text-sm text-slate-800 shadow-sm">
      <p className="font-semibold">PolicyLens only analyzes privacy policies.</p>
      <p className="mt-1 text-xs">No privacy policy was detected on this page.</p>
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ analysis, loading, onClose }) => {
  const scored = analysis && !analysis.out_of_scope ? calculateScore(analysis) : null;

  return (
    <aside className="h-screen w-[420px] border-l border-slate-200 bg-slate-50 text-slate-900 shadow-2xl">
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h1 className="text-base font-bold tracking-tight">PolicyLens</h1>
            <p className="text-xs text-slate-600">Privacy policy summarizer</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <DisclaimerBanner />

          {loading && <LoadingState />}
          {!loading && !analysis && <EmptyState />}
          {!loading && analysis?.out_of_scope && <OutOfScopeState />}

          {!loading && analysis && !analysis.out_of_scope && scored && (
            <>
              <ScoreGauge score={scored.score} grade={scored.grade} />
              <section className="space-y-2">
                {analysis.sections.map((section) => (
                  <SectionCard key={`${section.title}-${section.short_summary}`} {...section} />
                ))}
              </section>
              <ScoreBreakdown breakdown={scored.breakdown} />
            </>
          )}
        </div>
      </div>
    </aside>
  );
};
