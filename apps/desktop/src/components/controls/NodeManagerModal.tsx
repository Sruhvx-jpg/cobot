import React, { useState, useEffect } from "react";
import {
  Server,
  Radio,
  QrCode,
  HardDrive,
  Copy,
  Check,
  X,
  Loader2,
  RefreshCw,
  ExternalLink,
  Smartphone,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import QRCode from "qrcode";
import { useEndpoint } from "../../context/EndpointContext.js";
import {
  checkEcosystemUpdates,
  type AppReleaseInfo,
} from "../../services/updater.js";

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
  const { endpoint, setEndpoint, isRemote, apiUrl } = useEndpoint();

  // Instabox Sandboxes
  const [boxes, setBoxes] = useState<InstaboxSandbox[]>([]);
  const [selectedBox, setSelectedBox] = useState<string>("cobots");
  const [boxesLoading, setBoxesLoading] = useState(false);

  // Seeding
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  // Tunnel state
  const [tunnelProvider, setTunnelProvider] = useState<
    "instabox" | "cloudflare"
  >("instabox");
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelToken, setTunnelToken] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Updates
  const [updates, setUpdates] = useState<AppReleaseInfo[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  const refreshData = async () => {
    // 1. Fetch Instabox sandboxes
    setBoxesLoading(true);
    try {
      const res = await fetch(apiUrl("/api/system/instabox/boxes"));
      const data = await res.json();
      if (Array.isArray(data.boxes) && data.boxes.length > 0) {
        setBoxes(data.boxes);
        setSelectedBox(data.boxes[0].name || "cobots");
      }
    } catch {
      // Fallback
    } finally {
      setBoxesLoading(false);
    }

    // 2. Fetch current tunnel status
    try {
      const res = await fetch(apiUrl("/api/system/tunnel"));
      const data = await res.json();
      if (data.active && data.endpoint) {
        setTunnelActive(true);
        setTunnelUrl(data.endpoint);
        setTunnelToken(data.token);
        if (data.provider) setTunnelProvider(data.provider);

        const payload = JSON.stringify({
          endpoint: data.endpoint,
          token: data.token,
          name: "Cobot Cloud Node",
        });
        const qr = await QRCode.toDataURL(payload, {
          width: 220,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrCodeDataUrl(qr);
      } else {
        setTunnelActive(false);
      }
    } catch {
      setTunnelActive(false);
    }

    // 3. Fetch app updates
    setUpdatesLoading(true);
    checkEcosystemUpdates({
      "cobot.desktop": "0.1.0",
      "cobot.agent-daemon": "0.1.0",
      "cobot.vecs": "0.1.0",
      "cobot.sabha": "0.0.0-unstable",
      "cobot.tracer-duty": "0.1.0",
    }).then((res) => {
      setUpdates(res);
      setUpdatesLoading(false);
    });
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen, apiUrl]);

  const handleSeed = async () => {
    if (!selectedBox.trim()) return;
    setSeedLoading(true);
    setSeedStatus(null);

    try {
      const res = await fetch(apiUrl("/api/system/seed"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: selectedBox.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSeedStatus(
          `✅ Ecosystem and credentials seeded to sandbox '${selectedBox}'`,
        );
      } else {
        setSeedStatus(`❌ Seeding failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      setSeedStatus(`❌ Error: ${(err as Error).message}`);
    } finally {
      setSeedLoading(false);
    }
  };

  const handleStartTunnel = async () => {
    setTunnelLoading(true);
    try {
      const res = await fetch(apiUrl("/api/system/tunnel/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: tunnelProvider,
          boxName: selectedBox,
        }),
      });
      const data = await res.json();
      if (data.active && data.endpoint) {
        setTunnelActive(true);
        setTunnelUrl(data.endpoint);
        setTunnelToken(data.token);

        const payload = JSON.stringify({
          endpoint: data.endpoint,
          token: data.token,
          name: "Cobot Cloud Node",
        });
        const qr = await QRCode.toDataURL(payload, {
          width: 220,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        setQrCodeDataUrl(qr);
      }
    } catch (err) {
      console.error("Tunnel start failed:", err);
    } finally {
      setTunnelLoading(false);
    }
  };

  const handleStopTunnel = async () => {
    setTunnelLoading(true);
    try {
      await fetch(apiUrl("/api/system/tunnel/stop"), { method: "POST" });
      setTunnelActive(false);
      setTunnelUrl(null);
      setTunnelToken(null);
      setQrCodeDataUrl(null);
    } catch (err) {
      console.error("Tunnel stop failed:", err);
    } finally {
      setTunnelLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Top Bar */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-main)]">
          <div className="flex items-center gap-2.5">
            <Server className="text-orange-500" size={20} />
            <div>
              <h2 className="font-semibold text-sm text-[var(--text-main)]">
                Cobot Node Launchpad & Ecosystem Seeder
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Linear workflow: Authenticate ➔ Seed Sandbox ➔ Zero-Domain
                Tunnel ➔ Mobile QR
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Wizard Steps */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* STEP 1: AUTHENTICATION STATUS */}
          <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px]">
                  1
                </span>
                Antigravity Auth (Host Desktop)
              </span>
              {authStatus?.authenticated ? (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
                  <ShieldCheck size={12} /> Signed in as {authStatus.email}
                </span>
              ) : (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium flex items-center gap-1">
                  <ShieldAlert size={12} /> Not Signed In
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              {authStatus?.authenticated
                ? "Your local Antigravity credentials are ready to be pushed to the remote VM sandbox."
                : "Sign in using the LOGIN button in the header before seeding to carry authentication over."}
            </p>
          </div>

          {/* STEP 2: SELECT & SEED INSTABOX */}
          <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px]">
                  2
                </span>
                Target Instabox Sandbox
              </span>
              <button
                onClick={refreshData}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw
                  size={11}
                  className={boxesLoading ? "animate-spin" : ""}
                />
                Refresh Sandboxes
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                  Detected Sandboxes (via <code>instabox ls</code>):
                </label>
                {boxes.length > 0 ? (
                  <select
                    value={selectedBox}
                    onChange={(e) => setSelectedBox(e.target.value)}
                    className="w-full text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none focus:border-orange-500 font-mono"
                  >
                    {boxes.map((b) => (
                      <option key={b.name} value={b.name}>
                        {b.name} ({b.state || "Active"}){" "}
                        {b.template ? `· ${b.template}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedBox}
                    onChange={(e) => setSelectedBox(e.target.value)}
                    placeholder="cobots"
                    className="w-full text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none focus:border-orange-500 font-mono"
                  />
                )}
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSeed}
                  disabled={seedLoading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {seedLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <HardDrive size={13} />
                  )}
                  Seed Ecosystem to Box
                </button>
              </div>
            </div>

            {seedStatus && (
              <div className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-xs font-mono text-[var(--text-main)]">
                {seedStatus}
              </div>
            )}
          </div>

          {/* STEP 3: ZERO-DOMAIN EDGE TUNNEL */}
          <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl space-y-3">
            <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px]">
                3
              </span>
              Zero-Domain Edge Tunnel
            </span>

            <div className="flex gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                <input
                  type="radio"
                  name="tunnel_provider"
                  value="instabox"
                  checked={tunnelProvider === "instabox"}
                  onChange={() => setTunnelProvider("instabox")}
                  className="accent-orange-500"
                />
                <span>
                  Instabox Native Edge (<code>*.instabox.tech</code>)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[var(--text-main)]">
                <input
                  type="radio"
                  name="tunnel_provider"
                  value="cloudflare"
                  checked={tunnelProvider === "cloudflare"}
                  onChange={() => setTunnelProvider("cloudflare")}
                  className="accent-orange-500"
                />
                <span>
                  Cloudflare Quick Tunnel (<code>*.trycloudflare.com</code>)
                </span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-[var(--text-muted)]">
                {tunnelActive ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Tunnel Live: {tunnelUrl}
                  </span>
                ) : (
                  "Starts an encrypted outbound edge tunnel without purchasing any domain."
                )}
              </div>

              {tunnelActive ? (
                <button
                  onClick={handleStopTunnel}
                  disabled={tunnelLoading}
                  className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Stop Tunnel
                </button>
              ) : (
                <button
                  onClick={handleStartTunnel}
                  disabled={tunnelLoading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {tunnelLoading ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Radio size={13} />
                  )}
                  Activate Tunnel
                </button>
              )}
            </div>

            {tunnelActive && tunnelUrl && (
              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setEndpoint(tunnelUrl)}
                  className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] hover:border-orange-500/50 rounded-lg text-xs font-medium text-[var(--text-main)] flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight size={13} className="text-orange-400" />
                  Switch Desktop to Chat through this Node
                </button>
                <button
                  onClick={() => setEndpoint("http://localhost:3000")}
                  className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg text-xs font-medium cursor-pointer"
                >
                  Reset Local (3000)
                </button>
              </div>
            )}
          </div>

          {/* STEP 4: MOBILE PAIRING QR CODE */}
          {tunnelActive && qrCodeDataUrl && (
            <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl flex items-center gap-6">
              <img
                src={qrCodeDataUrl}
                alt="Mobile Pairing QR Code"
                className="w-40 h-40 rounded-xl bg-white p-2 flex-shrink-0"
              />
              <div className="space-y-2">
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px]">
                    4
                  </span>
                  Mobile Pairing QR Code
                </span>
                <p className="text-xs text-[var(--text-main)] font-medium">
                  Scan this QR code with the Cobot Mobile App
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  The mobile app configures the secure tunnel endpoint and
                  pairing token in 3 seconds.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <code className="text-[11px] bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)] truncate max-w-xs font-mono select-all">
                    {tunnelUrl}
                  </code>
                  <button
                    onClick={() => {
                      if (tunnelUrl) {
                        navigator.clipboard.writeText(tunnelUrl);
                        setCopiedUrl(true);
                        setTimeout(() => setCopiedUrl(false), 2000);
                      }
                    }}
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-surface)] cursor-pointer"
                  >
                    {copiedUrl ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: APP-ID UPDATER TRACKER */}
          <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={13} />
                App-ID Releases (Granular Git Tracking)
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                Updates only changed binaries
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {updates.map((app) => (
                <div
                  key={app.appId}
                  className="p-2.5 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg flex items-center justify-between"
                >
                  <div className="overflow-hidden">
                    <div className="font-medium text-xs text-[var(--text-main)] truncate">
                      {app.name}
                    </div>
                    <code className="text-[10px] text-[var(--text-muted)] font-mono">
                      v{app.currentVersion}
                    </code>
                  </div>
                  {app.hasUpdate ? (
                    <a
                      href={app.releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded text-[11px] font-medium flex items-center gap-1"
                    >
                      Update
                      <ExternalLink size={10} />
                    </a>
                  ) : (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
                      <Check size={11} /> OK
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
