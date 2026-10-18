import React from "react";
import { Cpu, ChevronDown } from "lucide-react";
import type { ModelOption } from "../../types/chat.js";

interface ModelSwitcherProps {
  models: ModelOption[];
  currentModel: ModelOption | null;
  onModelChange: (model: ModelOption) => void;
  disabled?: boolean;
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
  models,
  currentModel,
  onModelChange,
  disabled = false,
}) => {
  if (models.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-muted)] border border-[var(--border)] smooth-corners-sm bg-[var(--bg-surface)]">
        <Cpu size={14} className="opacity-50" />
        <span>No authenticated models</span>
      </div>
    );
  }

  const currentValue = currentModel
    ? `${currentModel.provider}:${currentModel.id}`
    : `${models[0].provider}:${models[0].id}`;

  return (
    <div className="relative inline-flex items-center">
      <div className="absolute left-2.5 pointer-events-none text-[var(--text-muted)] flex items-center">
        <Cpu size={14} />
      </div>
      <select
        className="appearance-none pl-8 pr-7 py-1.5 bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border)] hover:border-[var(--border-hover)] smooth-corners-sm text-xs font-medium cursor-pointer outline-none transition-colors"
        value={currentValue}
        onChange={(e) => {
          const [provider, id] = e.target.value.split(":");
          const selected = models.find(
            (m) => m.provider === provider && m.id === id,
          );
          if (selected) onModelChange(selected);
        }}
        disabled={disabled}
      >
        {models.map((m) => (
          <option
            key={`${m.provider}:${m.id}`}
            value={`${m.provider}:${m.id}`}
            className="bg-[var(--bg-surface)] text-[var(--text-main)]"
          >
            {m.label}
          </option>
        ))}
      </select>
      <div className="absolute right-2 pointer-events-none text-[var(--text-muted)] flex items-center">
        <ChevronDown size={13} />
      </div>
    </div>
  );
};
