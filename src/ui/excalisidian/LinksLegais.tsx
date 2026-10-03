// Links para os termos de uso e a política de privacidade (site), usados ao criar conta e em
// Configurações → Licenças e créditos. Abrem fora do app, do mesmo jeito que os outros links
// externos (`window.open` com noopener); o `href` fica no `<a>` para o destino ser legível, e o
// clique é interceptado para a janela do app não navegar.

import type { MouseEvent } from "react";

import { usePrefsStore } from "../../estado/prefsStore";
import { useTexto } from "../../i18n/useTexto";
import { ENDERECOS_LEGAIS } from "../../servico/enderecosLegais";

const CLASSE_LINK = "text-cristal underline-offset-2 hover:underline";

function abrirFora(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  window.open(e.currentTarget.href, "_blank", "noopener,noreferrer");
}

function useEnderecos() {
  const idioma = usePrefsStore((s) => s.idioma);
  return ENDERECOS_LEGAIS[idioma];
}

function LinkLegal({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} className={CLASSE_LINK} onClick={abrirFora}>
      {children}
    </a>
  );
}

/** Frase de aceite do modo "criar conta". Sem caixa de marcar: a frase basta. */
export function AvisoTermosConta() {
  const t = useTexto();
  const enderecos = useEnderecos();
  return (
    <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
      {t("conta.termos.antes")}
      <LinkLegal href={enderecos.termos}>{t("legal.termos")}</LinkLegal>
      {t("conta.termos.meio")}
      <LinkLegal href={enderecos.privacidade}>{t("legal.privacidade")}</LinkLegal>
      {t("conta.termos.depois")}
    </p>
  );
}

/** Linha com os dois links, para a seção de licenças. */
export function LinksLegaisLicencas() {
  const t = useTexto();
  const enderecos = useEnderecos();
  return (
    <p>
      <LinkLegal href={enderecos.termos}>{t("legal.termos")}</LinkLegal>
      {" · "}
      <LinkLegal href={enderecos.privacidade}>{t("legal.privacidade")}</LinkLegal>
    </p>
  );
}
