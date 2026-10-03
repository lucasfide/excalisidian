// Endereços públicos dos termos de uso e da política de privacidade. Um lugar só: o app, o site
// e os textos legais precisam apontar para os mesmos endereços.

import type { Idioma } from "../i18n/idioma";

export const ENDERECOS_LEGAIS: Record<Idioma, { termos: string; privacidade: string }> = {
  "pt-BR": {
    termos: "https://excalisidian.com/termos/",
    privacidade: "https://excalisidian.com/privacidade/",
  },
  en: {
    termos: "https://excalisidian.com/en/terms/",
    privacidade: "https://excalisidian.com/en/privacy/",
  },
};
