import tauriConfig from "../../src-tauri/tauri.conf.json";

export const RELEASES_URL = "https://github.com/wacxv/stickup/releases";
const LATEST_RELEASE_URL =
  "https://api.github.com/repos/wacxv/stickup/releases/latest";

export type UpdateCheckResult =
  | { status: "available"; version: string }
  | { status: "up-to-date"; version: string }
  | { status: "no-releases" };

type Semver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function parseSemver(version: string): Semver | null {
  const match = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]?.split(".") ?? [],
  };
}

function compareSemver(left: Semver, right: Semver): number {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }

  if (left.prerelease.length === 0 && right.prerelease.length > 0) return 1;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return -1;

  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    const leftPart = left.prerelease[i];
    const rightPart = right.prerelease[i];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) > Number(rightPart) ? 1 : -1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (response.status === 404) return { status: "no-releases" };
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status}`);
  }

  const release: unknown = await response.json();
  if (
    typeof release !== "object" ||
    release === null ||
    !("tag_name" in release) ||
    typeof release.tag_name !== "string"
  ) {
    throw new Error("GitHub returned an invalid release response");
  }

  const latestVersion = parseSemver(release.tag_name.replace(/^v/, ""));
  const currentVersion = parseSemver(tauriConfig.version);
  if (!latestVersion || !currentVersion) {
    throw new Error("Unable to compare release versions");
  }

  return compareSemver(latestVersion, currentVersion) > 0
    ? { status: "available", version: release.tag_name }
    : { status: "up-to-date", version: release.tag_name };
}
