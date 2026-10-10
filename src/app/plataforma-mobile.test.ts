import { describe, expect, it } from "vitest";
import { ehPlataformaMobile } from "./plataforma-mobile";

describe("plataforma do build", () => {
  it.each(["android", "ios"])("ativa o mobile somente em %s", (plataforma) => {
    expect(ehPlataformaMobile(plataforma)).toBe(true);
  });

  it.each([undefined, null, "windows", "linux", "macos", "", "Android", 375])(
    "preserva o desktop fora de um alvo mobile explícito (%s)",
    (plataforma) => {
      expect(ehPlataformaMobile(plataforma)).toBe(false);
    },
  );
});
