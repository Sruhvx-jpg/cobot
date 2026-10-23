export interface AppReleaseInfo {
  appId: string;
  name: string;
  tagPrefix: string;
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  releaseUrl?: string;
  downloadUrl?: string;
}

export interface EcosystemManifest {
  ecosystem: string;
  apps: Record<
    string,
    {
      name: string;
      path: string;
      tag_prefix: string;
      type: string;
    }
  >;
}

export const ECOSYSTEM_APPS: EcosystemManifest = {
  ecosystem: "cobot",
  apps: {
    "cobot.desktop": {
      name: "Desktop Client",
      path: "apps/desktop",
      tag_prefix: "desktop@",
      type: "frontend",
    },
    "cobot.agent-daemon": {
      name: "Agent Daemon",
      path: "apps/agent-daemon",
      tag_prefix: "agent-daemon@",
      type: "service",
    },
    "cobot.vecs": {
      name: "VecS Vector Store",
      path: "apps/vecs",
      tag_prefix: "vecs@",
      type: "service",
    },
    "cobot.sabha": {
      name: "Sabha Coordination Server",
      path: "apps/sabha",
      tag_prefix: "sabha@",
      type: "service",
    },
    "cobot.tracer-duty": {
      name: "Tracer Duty Telemetry",
      path: "apps/tracer-duty",
      tag_prefix: "tracer-duty@",
      type: "service",
    },
  },
};

const DEFAULT_REPO = "Sruhvx-jpg/cobot";

/**
 * Clean comparison of semantic version strings (e.g. 0.2.0 > 0.1.0)
 */
export function isVersionNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^[v^~]/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);

  if (lMaj > cMaj) return true;
  if (lMaj === cMaj && lMin > cMin) return true;
  if (lMaj === cMaj && lMin === cMin && lPat > cPat) return true;
  return false;
}

/**
 * Checks for updates for all registered app IDs against git release tags.
 */
export async function checkEcosystemUpdates(
  installedVersions: Record<string, string>,
  repo: string = DEFAULT_REPO,
): Promise<AppReleaseInfo[]> {
  const results: AppReleaseInfo[] = [];

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      console.warn(
        `[Updater] Failed to fetch releases from GitHub (${res.status}): ${res.statusText}`,
      );
      return Object.entries(ECOSYSTEM_APPS.apps).map(([appId, def]) => ({
        appId,
        name: def.name,
        tagPrefix: def.tag_prefix,
        currentVersion: installedVersions[appId] || "0.1.0",
        hasUpdate: false,
      }));
    }

    const releases: Array<{
      tag_name: string;
      html_url: string;
      assets: any[];
    }> = await res.json();

    for (const [appId, def] of Object.entries(ECOSYSTEM_APPS.apps)) {
      const current = installedVersions[appId] || "0.1.0";
      const prefix = def.tag_prefix;

      // Find the latest release matching this specific app's tag prefix
      const matchingRelease = releases.find((r) =>
        r.tag_name.startsWith(prefix),
      );

      if (matchingRelease) {
        const rawVersion = matchingRelease.tag_name.slice(prefix.length);
        const hasUpdate = isVersionNewer(rawVersion, current);

        results.push({
          appId,
          name: def.name,
          tagPrefix: prefix,
          currentVersion: current,
          latestVersion: rawVersion,
          hasUpdate,
          releaseUrl: matchingRelease.html_url,
        });
      } else {
        results.push({
          appId,
          name: def.name,
          tagPrefix: prefix,
          currentVersion: current,
          hasUpdate: false,
        });
      }
    }
  } catch (err) {
    console.error("[Updater] Check failed:", err);
  }

  return results;
}
