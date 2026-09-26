// src/servico/modoServidor.test.ts
import { describe, it, expect } from "vitest";

import { decidirModoServidor } from "./modoServidor";

describe("decidirModoServidor", () => {
  it("em produção, sempre real — mesmo com a variável ausente", () => {
    expect(decidirModoServidor({ dev: false, variavelServidor: undefined })).toBe("real");
  });

  it("em produção, real mesmo que a variável diga outra coisa", () => {
    expect(decidirModoServidor({ dev: false, variavelServidor: "local" })).toBe("real");
  });

  it("em desenvolvimento sem a variável, local (conta de teste + servidor local)", () => {
    expect(decidirModoServidor({ dev: true, variavelServidor: undefined })).toBe("local");
  });

  it("em desenvolvimento com VITE_SERVIDOR=real, usa o servidor de verdade", () => {
    expect(decidirModoServidor({ dev: true, variavelServidor: "real" })).toBe("real");
  });

  it("em desenvolvimento com qualquer outro valor da variável, local", () => {
    expect(decidirModoServidor({ dev: true, variavelServidor: "qualquer-coisa" })).toBe("local");
  });
});
