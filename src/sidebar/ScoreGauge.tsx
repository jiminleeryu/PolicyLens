import React from "react";

interface ScoreGaugeProps {
  score: number;
  grade: string;
}

const getGaugeColor = (score: number): string => {
  if (score < 50) {
    return "#dc2626";
  }
  if (score < 75) {
    return "#ca8a04";
  }
  return "#16a34a";
};

export const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, grade }) => {
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getGaugeColor(score);

  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-white p-4 shadow-sm">
      <div className="relative h-40 w-40">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 160 160" aria-label="Privacy Score Gauge">
          <circle cx="80" cy="80" r={radius} stroke="#e5e7eb" strokeWidth="14" fill="none" />
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke={color}
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-bold text-slate-900">{score}</span>
          <span className="text-sm font-semibold text-slate-700">Grade {grade}</span>
        </div>
      </div>
      <p className="mt-2 text-xs font-medium tracking-wide text-slate-600">Privacy Score</p>
    </div>
  );
};
