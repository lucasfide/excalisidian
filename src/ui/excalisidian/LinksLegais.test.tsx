import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { usePrefsStore } from "../../estado/prefsStore";
import { ENDERECOS_LEGAIS } from "../../servico/enderecosLegais";
import { AvisoTermosConta, LinksLegaisLicencas } from "./LinksLegais";

describe("links legais", () => {
  beforeEach(() => {
    usePrefsStore.setState({ idioma: "pt-BR" });
  });

  it("aviso de criar conta traz a frase e os dois links em português", () => {
    const html = renderToStaticMarkup(<AvisoTermosConta />);
    expect(html).toContain("Ao criar a conta, você concorda com os ");
    expect(html).toContain(`<a href="https://excalisidian.com/termos/"`);
    expect(html).toContain(">Termos de uso</a>");
    expect(html).toContain(`<a href="https://excalisidian.com/privacidade/"`);
    expect(html).toContain(">Política de privacidade</a>");
  });

  it("em inglês usa a frase e os endereços em inglês", () => {
    usePrefsStore.setState({ idioma: "en" });
    const html = renderToStaticMarkup(<AvisoTermosConta />);
    expect(html).toContain("By creating an account, you agree to the ");
    expect(html).toContain(`href="https://excalisidian.com/en/terms/"`);
    expect(html).toContain(`href="https://excalisidian.com/en/privacy/"`);
    expect(html).not.toContain("/termos/");
  });

  it("seção de licenças tem os dois links do idioma atual", () => {
    usePrefsStore.setState({ idioma: "en" });
    const html = renderToStaticMarkup(<LinksLegaisLicencas />);
    expect(html).toContain(ENDERECOS_LEGAIS.en.termos);
    expect(html).toContain(ENDERECOS_LEGAIS.en.privacidade);
  });
});
