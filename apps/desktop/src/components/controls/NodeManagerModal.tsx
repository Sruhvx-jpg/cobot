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
} from "lucide-react";
import QRCode from "qrcode";
import { useEndpoint } from "../../context/EndpointContext.js";
import {
  checkEcosystemUpdates,
  type AppReleaseInfo,
} from "../../services/updater.js";

interface NodeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NodeManagerModal: React.FC<NodeManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { endpoint, setEndpoint, isRemote, apiUrl } = useEndpoint();
  const [activeTab, setActiveTab] = useState<"tunnel" | "seed" | "updates">(
    "tunnel",
  );

  // Tunnel state
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelToken, setTunnelToken] = useState<string | null>(null);
  const [tunnelLoading, setTunnelLoading] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Seeding state
  const [seedTarget, setSeedTarget] = useState("instabox:work");
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  // Updates state
  const [updates, setUpdates] = useState<AppReleaseInfo[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);

  // Custom endpoint input
  const [customEndpoint, setCustomEndpoint] = useState(endpoint);

  useEffect(() => {
    if (!isOpen) return;

    // Check tunnel status
    fetch(apiUrl("/api/system/tunnel"))
      .then((r) => r.json())
      .then(async (data) => {
        if (data.active && data.endpoint) {
          setTunnelActive(true);
          setTunnelUrl(data.endpoint);
          setTunnelToken(data.token);

          const payload = JSON.stringify({
            endpoint: data.endpoint,
            token: data.token,
            name: "Cobot Cloud VM",
          });
          const qr = await QRCode.toDataURL(payload, {
            width: 200,
            margin: 1,
            color: { dark: "#000000", light: "#ffffff" },
          });
          setQrCodeDataUrl(qr);
        } else {
          setTunnelActive(false);
        }
      })
      .catch(() => setTunnelActive(false));

    // Fetch updates
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
  }, [isOpen, apiUrl]);

  const handleStartTunnel = async () => {
    setTunnelLoading(true);
    try {
      const res = await fetch(apiUrl("/api/system/tunnel/start"), {
        method: "POST",
      });
      const data = await res.json();
      if (data.active && data.endpoint) {
        setTunnelActive(true);
        setTunnelUrl(data.endpoint);
        setTunnelToken(data.token);

        const payload = JSON.stringify({
          endpoint: data.endpoint,
          token: data.token,
          name: "Cobot Cloud VM",
        });
        const qr = await QRCode.toDataURL(payload, {
          width: 200,
          margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
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

  const handleSeed = async () => {
    if (!seedTarget.trim()) return;
    setSeedLoading(true);
    setSeedStatus(null);

    try {
      const res = await fetch(apiUrl("/api/system/seed"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: seedTarget.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setSeedStatus("✅ Successfully seeded ecosystem to " + seedTarget);
      } else {
        setSeedStatus("❌ Seeding failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      setSeedStatus("❌ Seeding error: " + (err as Error).message);
    } finally {
      setSeedLoading(false);
    }
  };

  const handleApplyEndpoint = (url: string) => {
    setEndpoint(url);
    setCustomEndpoint(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="text-orange-500" size={20} />
            <h2 className="font-semibold text-base text-[var(--text-main)]">
              Node & Ecosystem Manager
            </h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isRemote
                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              }`}
            >
              {isRemote ? "Remote VM Active" : "Local Host Active"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)] bg-[var(--bg-main)] px-5 gap-6 text-sm">
          <button
            onClick={() => setActiveTab("tunnel")}
            className={`py-3 font-medium border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "tunnel"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <Radio size={16} />
            Quick Tunnel & Mobile
          </button>
          <button
            onClick={() => setActiveTab("seed")}
            className={`py-3 font-medium border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "seed"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <HardDrive size={16} />
            Seed Remote Node
          </button>
          <button
            onClick={() => setActiveTab("updates")}
            className={`py-3 font-medium border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "updates"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
          >
            <Sparkles size={16} />
            App-ID Updates
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === "tunnel" && (
            <div className="space-y-4">
              <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-sm text-[var(--text-main)] flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                      Cloudflare Zero-Domain Quick Tunnel
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      3-Step zero-account HTTPS tunnel (trycloudflare.com)
                    </p>
                  </div>
                  {tunnelActive ? (
                    <button
                      onClick={handleStopTunnel}
                      disabled={tunnelLoading}
                      className="px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                    >
                      Stop Tunnel
                    </button>
                  ) : (
                    <button
                      onClick={handleStartTunnel}
                      disabled={tunnelLoading}
                      className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {tunnelLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Radio size={14} />
                      )}
                      Start Quick Tunnel
                    </button>
                  )}
                </div>

                {tunnelActive && tunnelUrl && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-3">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] block mb-1">
                        Live Public HTTPS Endpoint:
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-[var(--bg-surface)] px-2.5 py-1.5 rounded border border-[var(--border)] flex-1 text-orange-400 select-all overflow-x-auto">
                          {tunnelUrl}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(tunnelUrl);
                            setCopiedUrl(true);
                            setTimeout(() => setCopiedUrl(false), 2000);
                          }}
                          className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-hover)] cursor-pointer"
                        >
                          {copiedUrl ? (
                            <Check size={16} className="text-emerald-400" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => handleApplyEndpoint(tunnelUrl)}
                        className="px-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border)] hover:border-orange-500/50 rounded-lg text-xs font-medium text-[var(--text-main)] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <ArrowRight size={14} className="text-orange-400" />
                        Point Desktop App to Tunnel
                      </button>
                    </div>

                    {/* QR Code Card */}
                    {qrCodeDataUrl && (
                      <div className="mt-4 p-4 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg flex items-center gap-5">
                        <img
                          src={qrCodeDataUrl}
                          alt="Mobile Pairing QR Code"
                          className="w-36 h-36 rounded-md bg-white p-1"
                        />
                        <div className="space-y-1.5">
                          <h4 className="font-medium text-sm text-[var(--text-main)] flex items-center gap-1.5">
                            <Smartphone size={16} className="text-purple-400" />
                            Scan with Cobot Mobile
                          </h4>
                          <p className="text-xs text-[var(--text-muted)]">
                            Open the Tauri mobile app on iOS/Android, tap "Pair
                            Box", and scan this QR code to connect securely
                            without typing.
                          </p>
                          <div className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-main)] p-2 rounded border border-[var(--border)] font-mono">
                            Token: {tunnelToken?.slice(0, 16)}...
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Endpoint Override */}
              <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg space-y-2">
                <label className="text-xs font-medium text-[var(--text-main)] block">
                  Active Desktop API Endpoint:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                    placeholder="http://localhost:3000"
                    className="flex-1 text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none focus:border-orange-500 font-mono"
                  />
                  <button
                    onClick={() => handleApplyEndpoint(customEndpoint)}
                    className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] hover:bg-[var(--bg-hover)] text-xs font-medium rounded-lg text-[var(--text-main)] transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => handleApplyEndpoint("http://localhost:3000")}
                    className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border)] hover:bg-[var(--bg-hover)] text-xs font-medium rounded-lg text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors cursor-pointer"
                  >
                    Reset Local
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "seed" && (
            <div className="space-y-4">
              <div className="p-4 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg space-y-3">
                <h3 className="font-medium text-sm text-[var(--text-main)] flex items-center gap-2">
                  <HardDrive size={16} className="text-orange-500" />
                  Seed Ecosystem to Remote Node / Instabox
                </h3>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Streams your local Cobot vault (agent manifests, Inode index,
                  and Antigravity credentials) directly to the target VM over
                  SSH or Instabox CLI into <code>/data/home/.cobot</code>.
                </p>

                <div className="space-y-2 pt-2">
                  <label className="text-xs text-[var(--text-muted)] block">
                    Target Node (e.g. <code>instabox:work</code> or{" "}
                    <code>user@192.168.1.100</code>):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={seedTarget}
                      onChange={(e) => setSeedTarget(e.target.value)}
                      placeholder="instabox:work"
                      className="flex-1 text-xs bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-main)] outline-none focus:border-orange-500 font-mono"
                    />
                    <button
                      onClick={handleSeed}
                      disabled={seedLoading}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {seedLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <HardDrive size={14} />
                      )}
                      Seed to Node
                    </button>
                  </div>
                </div>

                {seedStatus && (
                  <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-lg text-xs font-mono text-[var(--text-main)]">
                    {seedStatus}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "updates" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs text-[var(--text-muted)]">
                  Modular updates by App ID from GitHub Releases:
                </span>
                <button
                  onClick={() => {
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
                  }}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded cursor-pointer"
                >
                  <RefreshCw
                    size={14}
                    className={updatesLoading ? "animate-spin" : ""}
                  />
                </button>
              </div>

              <div className="space-y-2">
                {updates.map((app) => (
                  <div
                    key={app.appId}
                    className="p-3 bg-[var(--bg-main)] border border-[var(--border)] rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-[var(--text-main)]">
                          {app.name}
                        </span>
                        <code className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded">
                          {app.appId}
                        </code>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-1">
                        Current: <code>v{app.currentVersion}</code>{" "}
                        {app.latestVersion && (
                          <>
                            · Latest: <code>v{app.latestVersion}</code>
                          </>
                        )}
                      </div>
                    </div>

                    {app.hasUpdate ? (
                      <a
                        href={app.releaseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20 rounded text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        Update to v{app.latestVersion}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <Check size={12} /> Up to date
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
