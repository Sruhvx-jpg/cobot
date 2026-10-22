import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { exec } from "node:child_process";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  CredentialVault,
  type StoredCredentials,
} from "./vault.js";

const CLIENT_ID = ANTIGRAVITY_CLIENT_ID;
const CLIENT_SECRET = ANTIGRAVITY_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/aicode",
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export type StoredAuth = StoredCredentials & {
  provider: "antigravity";
};

function base64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePKCE() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export async function getStoredAuth(): Promise<StoredAuth | null> {
  const creds = await CredentialVault.get("antigravity");
  if (!creds) return null;

  // Auto-refresh token if expired or about to expire in next 60s
  if (creds.refresh_token && Date.now() >= creds.expires_at - 60_000) {
    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: creds.refresh_token,
          grant_type: "refresh_token",
        }).toString(),
      });

      if (res.ok) {
        const tokenData = (await res.json()) as {
          access_token: string;
          expires_in: number;
        };
        creds.access_token = tokenData.access_token;
        creds.expires_at = Date.now() + tokenData.expires_in * 1000;
        await CredentialVault.set("antigravity", creds);
      }
    } catch (err) {
      console.error("[AGY OAuth] Automatic token refresh failed:", err);
    }
  }

  return creds as StoredAuth | null;
}

export async function clearAuth(): Promise<void> {
  await CredentialVault.delete("antigravity");
}

export class AntigravityOAuth {
  private activeServer?: Server;

  async startLoginFlow(): Promise<{
    authUrl: string;
    waitForCompletion: () => Promise<StoredAuth>;
  }> {
    if (this.activeServer) {
      this.activeServer.close();
      this.activeServer = undefined;
    }

    const { verifier, challenge } = generatePKCE();
    const state = base64Url(randomBytes(32));

    const authParams = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `${AUTH_URL}?${authParams.toString()}`;

    // Automatically launch desktop system browser (Chrome/Firefox)
    const openCmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    exec(`${openCmd} "${authUrl}"`, (err) => {
      if (err) console.error("[AGY OAuth] Auto-open failed:", err.message);
    });

    const waitForCompletion = () =>
      new Promise<StoredAuth>((resolve, reject) => {
        const timeout = setTimeout(
          () => {
            server.close();
            reject(new Error("OAuth sign-in timed out"));
          },
          5 * 60 * 1000,
        );

        const server = createServer(async (req, res) => {
          try {
            const reqUrl = new URL(req.url || "/", "http://localhost:51121");
            if (reqUrl.pathname !== "/oauth-callback") {
              res.writeHead(404).end("Not found");
              return;
            }

            const code = reqUrl.searchParams.get("code");
            const returnedState = reqUrl.searchParams.get("state");

            if (returnedState !== state || !code) {
              res.writeHead(400).end("Invalid state or missing code");
              clearTimeout(timeout);
              server.close();
              reject(new Error("State mismatch or missing authorization code"));
              return;
            }

            // Exchange code for tokens
            const tokenRes = await fetch(TOKEN_URL, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code,
                grant_type: "authorization_code",
                redirect_uri: REDIRECT_URI,
                code_verifier: verifier,
              }).toString(),
            });

            if (!tokenRes.ok) {
              const errText = await tokenRes.text();
              res.writeHead(500).end("Token exchange failed");
              clearTimeout(timeout);
              server.close();
              reject(new Error(`Token exchange failed: ${errText}`));
              return;
            }

            const tokenData = (await tokenRes.json()) as {
              access_token: string;
              refresh_token?: string;
              expires_in: number;
            };

            // Fetch user info
            const userRes = await fetch(
              "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
              {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              },
            );
            const userData = (await userRes.json()) as { email?: string };
            const email = userData.email || "antigravity-user";

            const authResult: StoredAuth = {
              provider: "antigravity",
              email,
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token || "",
              expires_at: Date.now() + tokenData.expires_in * 1000,
              projectId: "aicode-consumers",
            };

            await CredentialVault.set("antigravity", authResult);

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(
              "<!DOCTYPE html><html><body style='background:#000;color:#fff;font-family:sans-serif;padding:40px;text-align:center'><h2>Authentication Successful</h2><p>You can return to Cobot.</p></body></html>",
            );

            clearTimeout(timeout);
            server.close();
            resolve(authResult);
          } catch (err) {
            clearTimeout(timeout);
            server.close();
            reject(err);
          }
        });

        server.listen(51121, "127.0.0.1", () => {
          this.activeServer = server;
        });
      });

    return { authUrl, waitForCompletion };
  }
}
