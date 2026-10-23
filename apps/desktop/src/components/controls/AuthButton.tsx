import React, { useState } from "react";
import {
  LogIn,
  LogOut,
  Loader2,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  X,
} from "lucide-react";
import { useEndpoint } from "../../context/EndpointContext.js";
import type { AuthStatus } from "../../types/chat.js";

interface AuthButtonProps {
  authStatus: AuthStatus;
  onRefreshAuth: () => void;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  authStatus,
  onRefreshAuth,
}) => {
  const [loading, setLoading] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { apiUrl, isRemote, syncCredentialsToRemote } = useEndpoint();

  const handleLogin = async () => {
    try {
      setLoading(true);
      const startUrl = isRemote
        ? "http://localhost:3000/api/auth/antigravity/start"
        : apiUrl("/api/auth/antigravity/start");
      const statusUrl = isRemote
        ? "http://localhost:3000/api/auth/status"
        : apiUrl("/api/auth/status");

      const res = await fetch(startUrl, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (data.authUrl) {
        setAuthUrl(data.authUrl);

        // Poll for completion (backend automatically opens system browser via xdg-open)
        const interval = setInterval(async () => {
          try {
            const statusRes = await fetch(statusUrl);
            const statusData = await statusRes.json();
            if (statusData.authenticated) {
              clearInterval(interval);
              setLoading(false);
              setAuthUrl(null);

              // If connected to remote VM, sync the credentials directly to the VM
              if (isRemote && statusData.credentials) {
                await syncCredentialsToRemote(statusData.credentials);
              }
              onRefreshAuth();
            }
          } catch {
            // Keep polling while auth is in progress
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Auth flow failed:", err);
      setLoading(false);
      setAuthUrl(null);
    }
  };

  const handleCopy = () => {
    if (!authUrl) return;
    navigator.clipboard.writeText(authUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = () => {
    setLoading(false);
    setAuthUrl(null);
  };

  const handleLogout = async () => {
    try {
      await fetch(apiUrl("/api/auth/logout"), { method: "POST" });
      onRefreshAuth();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (authStatus.authenticated && authStatus.email) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-1 border border-[var(--border)] bg-[var(--bg-card)] smooth-corners-sm text-xs font-mono">
        <ShieldCheck size={14} className="text-[var(--text-main)] opacity-80" />
        <span className="text-[var(--text-muted)] max-w-[140px] truncate">
          {authStatus.email}
        </span>
        <button
          className="text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors ml-1 p-0.5 cursor-pointer"
          onClick={handleLogout}
          title="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border)] hover:border-[var(--border-hover)] smooth-corners-sm text-xs font-semibold tracking-wide transition-colors cursor-pointer"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            <span>LOGGING IN...</span>
          </>
        ) : (
          <>
            <LogIn size={13} />
            <span>LOGIN</span>
          </>
        )}
      </button>

      {loading && authUrl && (
        <div className="absolute right-0 top-10 z-50 flex items-center gap-1.5 p-2 bg-[var(--bg-card)] border border-[var(--border)] smooth-corners-sm shadow-xl text-xs whitespace-nowrap">
          <a
            href={authUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] hover:text-[var(--text-main)] border border-[var(--border)] smooth-corners-sm text-[var(--text-muted)] transition-colors"
          >
            <ExternalLink size={12} />
            <span>Open Browser</span>
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-surface)] hover:text-[var(--text-main)] border border-[var(--border)] smooth-corners-sm text-[var(--text-muted)] transition-colors cursor-pointer"
            title="Copy URL"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy Link"}</span>
          </button>
          <button
            onClick={handleCancel}
            className="p-1 hover:text-red-400 text-[var(--text-muted)] transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
