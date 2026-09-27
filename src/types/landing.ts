export type DesktopSystem = "windows" | "linux" | "macos";

export interface DownloadOption {
  system: DesktopSystem;
  label: string;
  architecture: string;
  format: string;
  url: string;
}

export interface BrowserPlatform {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}
