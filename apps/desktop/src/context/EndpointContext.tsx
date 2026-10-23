import React, { createContext, useContext, useState, useEffect } from "react";

interface EndpointContextType {
  endpoint: string;
  setEndpoint: (url: string) => void;
  apiUrl: (path: string) => string;
  isRemote: boolean;
  syncCredentialsToRemote: (creds: unknown) => Promise<boolean>;
}

const DEFAULT_ENDPOINT = "http://localhost:3000";

const EndpointContext = createContext<EndpointContextType>({
  endpoint: DEFAULT_ENDPOINT,
  setEndpoint: () => {},
  apiUrl: (p) => `${DEFAULT_ENDPOINT}${p.startsWith("/") ? "" : "/"}${p}`,
  isRemote: false,
  syncCredentialsToRemote: async () => false,
});

export const EndpointProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [endpoint, setEndpointState] = useState<string>(() => {
    return localStorage.getItem("cobot_endpoint") || DEFAULT_ENDPOINT;
  });

  const isRemote = endpoint !== DEFAULT_ENDPOINT;

  const setEndpoint = (url: string) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    const finalUrl = trimmed || DEFAULT_ENDPOINT;
    setEndpointState(finalUrl);
    localStorage.setItem("cobot_endpoint", finalUrl);
  };

  const apiUrl = (path: string) => {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${endpoint}${cleanPath}`;
  };

  const syncCredentialsToRemote = async (creds: unknown): Promise<boolean> => {
    if (!isRemote) return false;
    try {
      const res = await fetch(apiUrl("/api/auth/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: creds }),
      });
      return res.ok;
    } catch (err) {
      console.error(
        "[EndpointContext] Failed to sync credentials to remote:",
        err,
      );
      return false;
    }
  };

  return (
    <EndpointContext.Provider
      value={{
        endpoint,
        setEndpoint,
        apiUrl,
        isRemote,
        syncCredentialsToRemote,
      }}
    >
      {children}
    </EndpointContext.Provider>
  );
};

export const useEndpoint = () => useContext(EndpointContext);
