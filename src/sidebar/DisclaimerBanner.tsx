import React from "react";

export const DisclaimerBanner: React.FC = () => {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs leading-relaxed text-amber-900">
      <p>
        ⚠️ AI-Generated Analysis — PolicyLens uses an LLM to summarize this policy. Summaries may contain
        inaccuracies or omissions. Always read the original policy before making privacy decisions.
      </p>
    </div>
  );
};
