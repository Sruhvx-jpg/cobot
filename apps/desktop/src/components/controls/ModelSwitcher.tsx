import React, { useState, useRef, useEffect } from "react";
import { Cpu, ChevronDown, Check, Brain, Sparkles } from "lucide-react";
import type { ModelOption, ThinkingLevel } from "../../types/chat.js";

interface ModelSwitcherProps {
  models: ModelOption[];
  currentModel: ModelOption | null;
  onModelChange: (model: ModelOption) => void;
  thinkingLevel: ThinkingLevel;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  disabled?: boolean;
}

const THINKING_LEVELS: Array<{ id: ThinkingLevel; label: string }> = [
  { id: "off", label: "Off" },
  { id: "minimal", label: "Min" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Med" },
  { id: "high", label: "High" },
];

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
  models,
  currentModel,
  onModelChange,
  thinkingLevel,
  onThinkingLevelChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen]);

  if (models.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-muted)] border border-[var(--border)] smooth-corners-sm bg-[var(--bg-surface)]">
        <Cpu size={14} className="opacity-50" />
        <span>No authenticated models</span>
      </div>
    );
  }

  const selectedModel = currentModel || models[0];

  return (
    <div className="relative inline-flex items-center" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className="h-8 px-2.5 bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border)] hover:border-[var(--border-hover)] smooth-corners-sm text-xs font-medium cursor-pointer outline-none transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        title="Change model and thinking level"
      >
        <Cpu size={14} className="text-[var(--text-muted)] flex-shrink-0" />
        <span className="max-w-[150px] truncate">{selectedModel.label}</span>

        {/* Thinking Level Badge */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          <Brain size={10} />
          <span className="capitalize">{thinkingLevel}</span>
        </div>

        <ChevronDown
          size={13}
          className={`text-[var(--text-muted)] transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Upward Dropdown Card */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 w-96 border border-[var(--border)] bg-[var(--bg-card)] smooth-corners-sm shadow-2xl z-50 py-1 flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] border-b border-[var(--border)] flex items-center justify-between">
            <span>Models & Thinking Level</span>
            <div className="flex items-center gap-1 text-[var(--text-subtle)]">
              <Brain size={11} />
              <span>Hover to set reasoning</span>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {models.map((m) => {
              const isSelected = selectedModel.id === m.id;
              const isHovered = hoveredModelId === m.id;

              return (
                <div
                  key={`${m.provider}:${m.id}`}
                  className={`w-full px-3 py-2 flex items-center justify-between hover:bg-[var(--bg-surface)] cursor-pointer transition-colors ${
                    isSelected ? "bg-[var(--bg-surface)]/60" : ""
                  }`}
                  onMouseEnter={() => setHoveredModelId(m.id)}
                  onMouseLeave={() => setHoveredModelId(null)}
                  onClick={() => {
                    onModelChange(m);
                    setIsOpen(false);
                  }}
                >
                  {/* Left: Model Name & Provider */}
                  <div className="flex flex-col gap-0.5 pr-2 max-w-[160px]">
                    <span
                      className={`truncate text-xs ${
                        isSelected
                          ? "font-semibold text-[var(--text-main)]"
                          : "text-[var(--text-main)]"
                      }`}
                    >
                      {m.label}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                      {m.provider}
                    </span>
                  </div>

                  {/* Right: Thinking Level Selector on Hover, else Status */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isHovered ? (
                      <div
                        className="flex items-center gap-0.5 p-0.5 rounded-sm bg-[var(--bg-main)] border border-[var(--border)] animate-in fade-in duration-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {THINKING_LEVELS.map((lvl) => {
                          const isLevelActive = thinkingLevel === lvl.id;
                          return (
                            <button
                              key={lvl.id}
                              type="button"
                              className={`px-1.5 py-0.5 rounded-xs text-[10px] font-medium transition-colors cursor-pointer ${
                                isLevelActive
                                  ? "bg-[var(--text-main)] text-[var(--bg-main)] font-semibold"
                                  : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onModelChange(m);
                                onThinkingLevelChange(lvl.id);
                              }}
                              title={`Set ${lvl.label} thinking for ${m.label}`}
                            >
                              {lvl.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {isSelected && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[var(--bg-main)] border border-[var(--border)] text-[10px] text-[var(--text-muted)]">
                            <Brain size={10} />
                            <span className="capitalize">{thinkingLevel}</span>
                          </div>
                        )}
                        {isSelected && (
                          <Check
                            size={14}
                            className="text-[var(--text-main)]"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
