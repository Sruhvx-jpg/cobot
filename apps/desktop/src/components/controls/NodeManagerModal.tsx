import React, { useState, useEffect } from "react";
import {
  Server,
  Info,
  HardDrive,
  Check,
  X,
  Loader2,
  RefreshCw,
  Trash2,
  Maximize2,
  Minimize2,
  Terminal,
  Activity,
  CheckCircle2,
  ShieldCheck,
  Play,
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
  onInstructAgent?: (prompt: string) => void;
}

export const NodeManagerModal: React.FC<NodeManagerModalProps> = ({
  isOpen,
  onClose,
  authStatus,
  onInstructAgent,
}) => {
  const { apiUrl, endpoint } = useEndpoint();

  const [isExpanded, setIsExpanded] = useState(false);
  const [boxes, setBoxes] = useState<InstaboxSandbox[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>("cobots");
  const [boxesLoading, setBoxesLoading] = useState(false);

  // Seeding configuration
  const [purgeLocal, setPurgeLocal] = useState(false);
  const [isAgentExecuting, setIsAgentExecuting] = useState(false);

  // Live Agent Activity Log
  const [activityLogs, setActivityLogs] = useState<
    Array<{
      id: string;
      time: string;
      text: string;
      status: "pending" | "running" | "done" | "info";
    }>
  >([]);

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
    }
  }, [isOpen, apiUrl]);

  const handleInstructAgent = () => {
    if (!selectedTarget.trim()) return;

    setIsAgentExecuting(true);
    const now = new Date().toLocaleTimeString([], { hour12: false });

    // Initialize activity view steps
    setActivityLogs([
      {
        id: "1",
        time: now,
        text: `Command dispatched to agent: Seed ecosystem to ${selectedTarget}`,
        status: "info",
      },
      {
        id: "2",
        time: now,
        text: `Verifying VM connection: instabox wake ${selectedTarget}`,
        status: "running",
      },
      {
        id: "3",
        time: now,
        text: `Preparing remote filesystem: /data/home/.cobot`,
        status: "pending",
      },
      {
        id: "4",
        time: now,
        text: `Streaming vault, manifests & schemas (excluding runtime PIDs)`,
        status: "pending",
      },
      {
        id: "5",
        time: now,
        text: purgeLocal
          ? "Purging local daemon state post-verification"
          : "Preserving local daemon state for crash analysis & diagnostics",
        status: "pending",
      },
    ]);

    const prompt = `Seed yourself, the agent daemon, and the Cobot ecosystem to my VM target '${selectedTarget.trim()}'.
1. Verify the connection (run 'instabox wake ${selectedTarget.trim()}' if using Instabox).
2. Ensure '/data/home/.cobot' exists on the target: 'instabox exec ${selectedTarget.trim()} -- mkdir -p /data/home/.cobot'.
3. Stream the local ecosystem from '~/.cobot' cleanly to the target (exclude 'runtime/*'):
   tar --exclude='runtime/*' -czf - -C ~/.cobot . | instabox ssh ${selectedTarget.trim()} -- "tar xzf - -C /data/home/.cobot"
4. Verify that files and schemas landed properly on the VM: 'instabox exec ${selectedTarget.trim()} -- ls -la /data/home/.cobot'.
${
  purgeLocal
    ? "5. Once verified, purge the local daemon state as requested: rm -rf ~/.cobot/vaults ~/.cobot/sessions ~/.cobot/vault.json."
    : "5. Preserve the local agent daemon intact for crash analysis and diagnostics."
}`;

    if (onInstructAgent) {
      onInstructAgent(prompt);
      // Auto-expand card so user immediately sees live activity
      setIsExpanded(true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className={`w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
          isExpanded
            ? "max-w-4xl min-h-[75vh] max-h-[90vh]"
            : "max-w-lg max-h-[85vh]"
        }`}
      >
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Server className="text-orange-500" size={18} />
            <div>
              <h2 className="font-semibold text-sm text-[var(--text-main)]">
                Seed Agent to Cloud VM
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Autonomous deployment to your preferred Instabox or VM sandbox
              </p>
            </div>
          </div>

          {/* Action icons: Expand/Collapse + Close */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title={
                isExpanded ? "Collapse card view" : "Expand to detailed view"
              }
            >
              {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Close modal"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Info callout */}
          <div className="p-3.5 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
            <Info size={18} className="text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--text-main)] leading-relaxed">
              <strong>Autonomous Agent Seeding:</strong> Your agent will
              directly connect to your preferred VM, prepare the environment,
              and seed the agent daemon, vault schemas, manifests, and its
              entire ecosystem.
            </div>
          </div>

          {/* Layout: Grid when expanded, stacked when compact */}
          <div
            className={`grid gap-5 ${
              isExpanded ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {/* Left Column: Form Controls */}
            <div className="space-y-4">
              {/* Local Auth State */}
              <div className="flex items-center justify-between text-xs px-3.5 py-2.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl">
                <span className="text-[var(--text-muted)]">
                  Agent Credentials:
                </span>
                {authStatus?.authenticated ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                    <ShieldCheck size={14} /> {authStatus.email}
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium">
                    Unauthenticated (Anonymous)
                  </span>
                )}
              </div>

              {/* Target selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[var(--text-main)] block">
                    Connected Instabox / VM Target:
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
                  Destination: <code>/data/home/.cobot</code> on the connected
                  box.
                </p>
              </div>

              {/* Optional purge toggle */}
              <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={purgeLocal}
                    onChange={(e) => setPurgeLocal(e.target.checked)}
                    className="mt-0.5 accent-orange-500 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-medium text-[var(--text-main)] flex items-center gap-1.5">
                      <Trash2 size={13} className="text-red-400" />
                      Purge local agent daemon after verification
                    </span>
                    <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                      <strong>Optional.</strong> Keep unchecked to preserve
                      local daemon for crash analysis & diagnostics (recommended
                      during unstable prototype releases).
                    </p>
                  </div>
                </label>
              </div>

              {/* Trigger button */}
              <button
                onClick={handleInstructAgent}
                disabled={!selectedTarget.trim()}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <Play size={14} className="fill-white" />
                <span>Instruct Agent to Seed VM</span>
              </button>
            </div>

            {/* Right Column (or Bottom): Live Agent Activity View */}
            <div className="flex flex-col bg-[var(--bg-main)] border border-[var(--border)] rounded-xl overflow-hidden min-h-[220px]">
              <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--bg-card)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal size={14} className="text-orange-400" />
                  <span className="text-xs font-semibold text-[var(--text-main)] font-mono">
                    Agent Live Activity View
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  {isAgentExecuting ? (
                    <span className="flex items-center gap-1.5 text-orange-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                      Agent Active
                    </span>
                  ) : (
                    <span className="text-[var(--text-muted)] flex items-center gap-1">
                      <Activity size={12} />
                      Standby
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 flex-1 font-mono text-xs overflow-y-auto space-y-2.5">
                {activityLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-[var(--text-muted)] py-8 space-y-2">
                    <Terminal size={24} className="opacity-40" />
                    <p className="text-xs">
                      Click "Instruct Agent to Seed VM" to stream live execution
                      steps here.
                    </p>
                  </div>
                ) : (
                  activityLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-start gap-2 text-[11px] leading-relaxed"
                    >
                      <span className="text-[var(--text-muted)] select-none">
                        [{log.time}]
                      </span>
                      {log.status === "running" ? (
                        <Loader2
                          size={12}
                          className="animate-spin text-orange-400 flex-shrink-0 mt-0.5"
                        />
                      ) : log.status === "done" ? (
                        <CheckCircle2
                          size={12}
                          className="text-emerald-400 flex-shrink-0 mt-0.5"
                        />
                      ) : log.status === "info" ? (
                        <span className="text-orange-400 select-none">➜</span>
                      ) : (
                        <span className="text-[var(--text-muted)] select-none">
                          ○
                        </span>
                      )}
                      <span
                        className={
                          log.status === "running"
                            ? "text-orange-300 font-medium"
                            : log.status === "done"
                              ? "text-emerald-300"
                              : "text-[var(--text-muted)]"
                        }
                      >
                        {log.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
