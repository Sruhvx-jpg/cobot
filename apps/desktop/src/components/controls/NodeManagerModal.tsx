import React, { useState, useEffect } from "react";
import {
  Server,
  Info,
  HardDrive,
  Check,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEndpoint } from "../../context/EndpointContext.js";

interface InstaboxSandbox {
  name: string;
  state: string;
  template?: string;
  created?: string;
}

interface NodeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  authStatus?: { authenticated: boolean; email?: string };
}

export const NodeManagerModal: React.FC<NodeManagerModalProps> = ({
  isOpen,
  onClose,
  authStatus,
}) => {
  const { apiUrl, endpoint, setEndpoint } = useEndpoint();

  const [boxes, setBoxes] = useState<InstaboxSandbox[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>("cobots");
  const [boxesLoading, setBoxesLoading] = useState(false);

  // Seeding state
  const [purgeLocal, setPurgeLocal] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const fetchSandboxes = async () => {
    setBoxesLoading(true);
    try {
      const res = await fetch(apiUrl("/api/system/instabox/boxes"));
      const data = await res.json();
      if (Array.isArray(data.boxes) && data.boxes.length > 0) {
        setBoxes(data.boxes);
        setSelectedTarget(data.boxes[0].name || "cobots");
      }
    } catch {
      // Fallback
    } finally {
      setBoxesLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSandboxes();
      setSeedResult(null);
    }
  }, [isOpen, apiUrl]);

  const handleSeed = async () => {
    if (!selectedTarget.trim()) return;
    setSeedLoading(true);
    setSeedResult(null);

    try {
      const res = await fetch(apiUrl("/api/system/seed"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: selectedTarget.trim(),
          purgeLocal,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSeedResult({
          success: true,
          message:
            data.message ||
            `Successfully seeded agent daemon and ecosystem to ${selectedTarget}`,
        });
      } else {
        setSeedResult({
          success: false,
          message: data.error || "Seeding failed",
        });
      }
    } catch (err) {
      setSeedResult({
        success: false,
        message: (err as Error).message,
      });
    } finally {
      setSeedLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
          <div className="flex items-center gap-2.5">
            <Server className="text-orange-500" size={18} />
            <h2 className="font-semibold text-sm text-[var(--text-main)]">
              Seed Agent to Cloud VM
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Info callout */}
          <div className="p-3.5 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
            <Info size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[var(--text-main)] leading-relaxed">
              Your agent will seed the agent daemon, vault schemas, manifests,
              and its entire ecosystem to your preferred VM.
            </p>
          </div>

          {/* Auth indicator */}
          <div className="flex items-center justify-between text-xs px-3 py-2 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg">
            <span className="text-[var(--text-muted)]">Local Auth State:</span>
            {authStatus?.authenticated ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <ShieldCheck size={13} /> {authStatus.email}
              </span>
            ) : (
              <span className="text-amber-400 font-medium">
                Not signed in (Anonymous Agent)
              </span>
            )}
          </div>

          {/* Target selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--text-main)] block">
                Connect Instabox or VM Target:
              </label>
              <button
                onClick={fetchSandboxes}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw
                  size={10}
                  className={boxesLoading ? "animate-spin" : ""}
                />
                Refresh
              </button>
            </div>

            {boxes.length > 0 ? (
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="w-full text-xs bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[var(--text-main)] outline-none focus:border-orange-500 font-mono"
              >
                {boxes.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.state || "Running"})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                placeholder="cobots or user@remote-ip"
                className="w-full text-xs bg-[var(--bg-main)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-[var(--text-main)] outline-none focus:border-orange-500 font-mono"
              />
            )}
            <p className="text-[11px] text-[var(--text-muted)]">
              Streams ecosystem to <code>/data/home/.cobot</code> on the
              connected box.
            </p>
          </div>

          {/* Optional purge daemon toggle */}
          <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={purgeLocal}
                onChange={(e) => setPurgeLocal(e.target.checked)}
                className="mt-0.5 accent-orange-500"
              />
              <div className="text-xs">
                <span className="font-medium text-[var(--text-main)] flex items-center gap-1.5">
                  <Trash2 size={13} className="text-red-400" />
                  Purge local agent daemon after seeding
                </span>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  Optional. Keep unchecked to preserve local daemon for crash
                  analysis and diagnostics (recommended while Cobot is in an
                  unstable release).
                </p>
              </div>
            </label>
          </div>

          {/* Seed result notification */}
          {seedResult && (
            <div
              className={`p-3 rounded-lg text-xs font-mono border ${
                seedResult.success
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}
            >
              {seedResult.message}
            </div>
          )}

          {/* Action button */}
          <button
            onClick={handleSeed}
            disabled={seedLoading || !selectedTarget.trim()}
            className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            {seedLoading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Seeding Agent & Ecosystem...</span>
              </>
            ) : (
              <>
                <HardDrive size={14} />
                <span>Seed Agent to VM</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
