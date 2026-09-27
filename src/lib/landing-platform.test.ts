import { describe, expect, it } from "vitest";
import { detectDesktopSystem } from "./landing-platform";
import { landingDownloads } from "../data/landing-downloads";

describe("landing download platform", () => {
  it.each([
    ["Mozilla Windows NT 10.0", "Win32", 0, "windows"],
    ["Mozilla Macintosh Intel Mac OS X", "MacIntel", 0, "macos"],
    ["Mozilla X11 Linux x86_64", "Linux x86_64", 0, "linux"],
    ["Mozilla Linux Android", "Linux armv8", 5, null],
    ["Mozilla Macintosh", "MacIntel", 5, null],
    ["Mozilla iPhone", "iPhone", 5, null],
    ["Mozilla CrOS x86_64", "Linux x86_64", 0, null],
    ["unknown", "", 0, null],
  ])("detects %s", (userAgent, platform, maxTouchPoints, expected) => {
    expect(detectDesktopSystem({ userAgent: String(userAgent), platform: String(platform), maxTouchPoints: Number(maxTouchPoints) })).toBe(expected);
  });

  it("links each system to its installer, never an updater signature", () => {
    expect(new Set(landingDownloads.map(option => option.system)).size).toBe(3);
    for (const option of landingDownloads) {
      const url = new URL(option.url);
      expect(url.origin).toBe("https://github.com");
      expect(url.pathname).toContain("/lucasfide/excalisidian/releases/download/");
      expect(url.pathname.endsWith(option.format)).toBe(true);
    }
  });
});
