import type { BrowserPlatform, DesktopSystem } from "../types/landing";

export function detectDesktopSystem(browser: BrowserPlatform): DesktopSystem | null {
  const identity = `${browser.userAgent} ${browser.platform}`;
  if (/Android|iPhone|iPad|iPod|Mobile|CrOS/i.test(identity)) return null;
  if (/Mac/i.test(browser.platform) && browser.maxTouchPoints > 1) return null;
  if (/Windows|Win32|Win64/i.test(identity)) return "windows";
  if (/Macintosh|MacIntel|MacPPC|Mac OS X/i.test(identity)) return "macos";
  if (/Linux|X11/i.test(identity)) return "linux";
  return null;
}
