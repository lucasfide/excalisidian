// Logotipo (doc 06): lettering "Excalisidian", alinhado à esquerda. Nada mais.

import lettering from "./lettering-excalisidian.png";

interface Props {
  /** Altura em px. Padrão 16 (cabeçalho histórico da sidebar); 32 na TelaBoasVindas
   * (doc 06, "Tela de boas-vindas" / doc 15 §0, decisão do usuário 16/09/2026). */
  altura?: number;
}

export default function Logotipo({ altura = 16 }: Props) {
  return (
    <img
      src={lettering}
      alt="Excalisidian"
      // `self-start` e `shrink-0`: em contêiner flex (ex.: TelaBoasVindas), o `align-items: stretch`
      // padrão e o encolhimento do item esticariam a LARGURA da imagem além da proporção nativa.
      className="block w-auto shrink-0 self-start select-none"
      // 16px casa com a altura dos botões-ícone ao lado (h-4, BotaoIcone sem `grande`), que são
      // quem define a altura da linha do cabeçalho — assim trocar o lettering não mexe no layout.
      // A imagem tem 27px de altura nativa: aqui ela reduz, nunca amplia.
      style={{ height: altura }}
      draggable={false}
    />
  );
}
