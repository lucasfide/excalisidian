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
      className="block w-auto select-none"
      // 16px casa com a altura dos botões-ícone ao lado (h-4, BotaoIcone sem `grande`), que são
      // quem define a altura da linha do cabeçalho — assim trocar o lettering não mexe no layout.
      // A imagem tem 27px de altura nativa: aqui ela reduz, nunca amplia.
      style={{ height: altura }}
      draggable={false}
    />
  );
}
