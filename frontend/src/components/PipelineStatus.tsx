import React from "react";
import { Check, Loader } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Stage {
  key: string;
  label: string;
  icon: LucideIcon;
}

interface Props {
  stages: Stage[];
  activeStage: number;
}

export default function PipelineStatus({ stages, activeStage }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-soft overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-gray-800">Pipeline Progress</h3>
        <span className="text-[11px] text-gray-400 font-medium tabular-nums">
          {Math.min(activeStage + 1, stages.length)}/{stages.length}
        </span>
      </div>

      <div className="px-5 py-4 space-y-0">
        {stages.map((stage, i) => {
          const Icon = stage.icon;
          const isDone = i < activeStage;
          const isActive = i === activeStage;
          const isPending = i > activeStage;

          return (
            <div key={stage.key} className="flex items-center gap-3 py-2">
              {/* Status indicator */}
              <div className={`
                w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300
                ${isDone ? "bg-emerald-50" : ""}
                ${isActive ? "bg-accent-50 shadow-glow" : ""}
                ${isPending ? "bg-gray-50" : ""}
              `}>
                {isDone && <Check size={13} className="text-emerald-500" strokeWidth={2.5} />}
                {isActive && <Loader size={13} className="text-accent-600 animate-spin" />}
                {isPending && <Icon size={13} className="text-gray-300" />}
              </div>

              {/* Label */}
              <span className={`text-[12px] font-medium transition-colors duration-300 ${
                isDone ? "text-gray-400" :
                isActive ? "text-gray-800" :
                "text-gray-300"
              }`}>
                {stage.label}
              </span>

              {/* Progress line */}
              {isDone && (
                <span className="ml-auto text-[10px] text-emerald-400 font-medium">done</span>
              )}
              {isActive && (
                <span className="ml-auto text-[10px] text-accent-500 font-medium">running</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="px-5 pb-4">
        <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-600 to-accent-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${((activeStage) / stages.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
