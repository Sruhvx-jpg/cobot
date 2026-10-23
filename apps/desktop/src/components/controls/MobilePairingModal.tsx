import React, { useState, useEffect } from "react";
import {
  Smartphone,
  Radio,
  QrCode,
  Copy,
  Check,
  X,
  Loader2,
  Sparkles,
  Wifi,
} from "lucide-react";
import QRCode from "qrcode";
import { useEndpoint } from "../../context/EndpointContext.js";

interface MobilePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobilePairingModal: React.FC<MobilePairingModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { apiUrl, endpoint } = useEndpoint();
  const [tunnelActive, setTunnelActive] = useState(false);
  const [activeUrl, setActiveUrl] = useState<string>(endpoint);
  const [pairingToken, setPairingToken] = useState<string>("cobot_live_token");
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const refreshTunnelAndQR = async () => {
    try {
      const res = await fetch(apiUrl("/api/system/tunnel"));
      const data = await res.json();
      let targetUrl = endpoint;
      let token = "cobot_pair_default";

      if (data.active && data.endpoint) {
        setTunnelActive(true);
        targetUrl = data.endpoint;
        token = data.token || token;
      } else {
        setTunnelActive(false);
      }

      setActiveUrl(targetUrl);
      setPairingToken(token);

      const payload = JSON.stringify({
        endpoint: targetUrl,
        token: token,
        name: "Cobot Node",
      });

      const qr = await QRCode.toDataURL(payload, {
        width: 260,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
      setQrCodeUrl(qr);
    } catch {
      // Fallback local QR
      const payload = JSON.stringify({
        endpoint,
        token: "cobot_local",
        name: "Cobot Local Node",
      });
      const qr = await QRCode.toDataURL(payload, { width: 260, margin: 2 });
      setQrCodeUrl(qr);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshTunnelAndQR();
    }
  }, [isOpen, endpoint]);

  const handleStartQuickTunnel = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/system/tunnel/start"), {
        method: "POST",
      });
      const data = await res.json();
      if (data.active && data.endpoint) {
        setTunnelActive(true);
        setActiveUrl(data.endpoint);
        setPairingToken(data.token);

        const payload = JSON.stringify({
          endpoint: data.endpoint,
          token: data.token,
          name: "Cobot Cloud VM",
        });
        const qr = await QRCode.toDataURL(payload, { width: 260, margin: 2 });
        setQrCodeUrl(qr);
      }
    } catch (err) {
      console.error("Tunnel error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPayload = () => {
    const payload = JSON.stringify({
      endpoint: activeUrl,
      token: pairingToken,
      name: "Cobot Node",
    });
    navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="text-orange-500" size={20} />
            <h3 className="font-semibold text-sm text-[var(--text-main)]">
              Pair Cobot Mobile App
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {tunnelActive ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                Cloudflare Quick Tunnel Active
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5">
                <Wifi size={12} />
                Local Network Mode
              </span>
            )}
          </div>

          {/* QR Code Frame */}
          <div className="p-3 bg-white rounded-xl shadow-inner border border-slate-200">
            {qrCodeUrl ? (
              <img
                src={qrCodeUrl}
                alt="Mobile Pairing QR Code"
                className="w-56 h-56 rounded-lg block"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center">
                <Loader2 className="animate-spin text-slate-400" size={32} />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--text-main)]">
              Point your phone's camera at this screen
            </p>
            <p className="text-[11px] text-[var(--text-muted)] max-w-xs">
              Open the Cobot Tauri mobile app on iOS or Android and tap{" "}
              <strong>"Pair Node"</strong> to connect instantly.
            </p>
          </div>

          {/* Connection URL Bar */}
          <div className="w-full bg-[var(--bg-main)] border border-[var(--border)] rounded-lg p-2.5 text-left flex items-center justify-between gap-2">
            <div className="overflow-hidden">
              <span className="text-[10px] text-[var(--text-muted)] block uppercase font-mono">
                Target Endpoint:
              </span>
              <code className="text-xs text-[var(--text-main)] truncate block font-mono">
                {activeUrl}
              </code>
            </div>
            <button
              onClick={handleCopyPayload}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-surface)] cursor-pointer flex-shrink-0"
              title="Copy pairing JSON"
            >
              {copied ? (
                <Check size={16} className="text-emerald-400" />
              ) : (
                <Copy size={16} />
              )}
            </button>
          </div>

          {/* 1-Click Zero-Domain Tunnel Trigger if not active */}
          {!tunnelActive && (
            <button
              onClick={handleStartQuickTunnel}
              disabled={loading}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Radio size={14} />
              )}
              Switch to Global Cloudflare Quick Tunnel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
