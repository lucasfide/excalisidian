import type { DownloadOption } from "../types/landing";

// Verified public release on 2026-09-19. Update version and filenames together.
export const downloadVersion = "0.5.6";
const release = `https://github.com/lucasfide/excalisidian/releases/download/v${downloadVersion}`;

export const landingDownloads: DownloadOption[] = [
  { system: "windows", label: "Windows", architecture: "Intel / AMD · 64 bits", format: ".exe", url: `${release}/Excalisidian_${downloadVersion}_x64-setup.exe` },
  { system: "linux", label: "Linux", architecture: "Intel / AMD · 64 bits", format: ".AppImage", url: `${release}/Excalisidian_${downloadVersion}_amd64.AppImage` },
  { system: "macos", label: "macOS", architecture: "Apple Silicon · M1 ou superior", format: ".dmg", url: `${release}/Excalisidian_${downloadVersion}_aarch64.dmg` },
];
