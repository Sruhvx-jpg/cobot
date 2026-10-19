import React, { useState, useRef, useEffect } from "react";
import { Bot, ChevronDown, Check, Plus, X, Sparkles } from "lucide-react";
import type { AgentOption } from "../../types/chat.js";

interface AgentSwitcherProps {
  agents: AgentOption[];
  currentAgent: AgentOption | null;
  onSelectAgent: (agent: AgentOption) => void;
  onRefreshAgents: () => Promise<void>;
}

export const AgentSwitcher: React.FC<AgentSwitcherProps> = ({
  agents,
  currentAgent,
  onSelectAgent,
  onRefreshAgents,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Agent Form State
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIdentity, setNewIdentity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = newName.trim();
    if (!cleanName) {
      setError("Agent name is required.");
      return;
    }

    const cleanId = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-");

    setIsSubmitting(true);
    try {
      const res = await fetch("http://localhost:3000/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cleanId,
          name: cleanName,
          description: newDescription.trim() || undefined,
          identity: newIdentity.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { agent } = await res.json();
      await onRefreshAgents();
      onSelectAgent(agent);

      // Reset and close modal
      setNewName("");
      setNewDescription("");
      setNewIdentity("");
      setIsModalOpen(false);
      setIsOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          className="h-8 px-2.5 border border-[var(--border)] hover:border-[var(--border-hover)] bg-[var(--bg-card)] text-[var(--text-main)] smooth-corners-sm text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors"
          onClick={() => setIsOpen((prev) => !prev)}
          title="Switch agent"
        >
          <Bot size={14} className="text-[var(--text-muted)]" />
          <span className="max-w-[130px] truncate">
            {currentAgent ? currentAgent.name : "Select Agent"}
          </span>
          <ChevronDown
            size={13}
            className={`text-[var(--text-muted)] transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1.5 w-64 border border-[var(--border)] bg-[var(--bg-card)] smooth-corners-sm shadow-2xl z-50 py-1 flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)] border-b border-[var(--border)] flex items-center justify-between">
              <span>Active Agent</span>
              <Sparkles size={11} />
            </div>

            <div className="max-h-60 overflow-y-auto py-1">
              {agents.map((agent) => {
                const isSelected = currentAgent?.id === agent.id;
                return (
                  <button
                    key={agent.id}
                    className={`w-full text-left px-3 py-2 flex items-start justify-between hover:bg-[var(--bg-surface)] cursor-pointer transition-colors ${
                      isSelected
                        ? "text-[var(--text-main)] font-medium bg-[var(--bg-surface)]"
                        : "text-[var(--text-muted)]"
                    }`}
                    onClick={() => {
                      onSelectAgent(agent);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex flex-col gap-0.5 pr-2">
                      <span className="font-medium text-[var(--text-main)] truncate">
                        {agent.name}
                      </span>
                      {agent.description && (
                        <span className="text-[11px] text-[var(--text-muted)] line-clamp-1">
                          {agent.description}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check
                        size={14}
                        className="text-[var(--text-main)] mt-0.5 flex-shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[var(--border)] pt-1 mt-0.5">
              <button
                className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-[var(--bg-surface)] text-[var(--text-main)] font-medium cursor-pointer transition-colors"
                onClick={() => {
                  setIsOpen(false);
                  setIsModalOpen(true);
                }}
              >
                <Plus size={14} />
                <span>Create New Agent</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Agent Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] smooth-corners-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot size={18} className="text-[var(--text-main)]" />
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  Create New Agent
                </h3>
              </div>
              <button
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer transition-colors"
                onClick={() => setIsModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleCreateAgent}
              className="p-5 flex flex-col gap-4"
            >
              {error && (
                <div className="px-3 py-2 bg-red-950/40 border border-red-800 text-red-300 text-xs smooth-corners-sm">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Agent Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Security Auditor, Code Reviewer"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] smooth-corners-sm text-xs focus:outline-hidden focus:border-[var(--border-hover)]"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Short summary of what this agent does"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] smooth-corners-sm text-xs focus:outline-hidden focus:border-[var(--border-hover)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-muted)]">
                  Identity & Custom Prompt Extension
                </label>
                <textarea
                  placeholder="You are a ruthless RFC and security auditor. Verify all bounds..."
                  value={newIdentity}
                  onChange={(e) => setNewIdentity(e.target.value)}
                  rows={4}
                  className="px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-main)] smooth-corners-sm text-xs focus:outline-hidden focus:border-[var(--border-hover)] resize-none"
                />
                <span className="text-[10px] text-[var(--text-muted)]">
                  Extends Cobot's base runtime preamble, tools, and safety
                  dogmas.
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-[var(--text-main)] text-[var(--bg-main)] font-medium text-xs smooth-corners-sm hover:opacity-90 cursor-pointer disabled:opacity-50 transition-opacity"
                >
                  {isSubmitting ? "Creating..." : "Save Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
