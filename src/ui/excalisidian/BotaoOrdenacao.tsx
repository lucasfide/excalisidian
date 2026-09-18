// Botão-dropdown de ordenação da árvore, ao lado do campo de busca (doc: ordenacao-arvore
// design, seção 4). Ícone fixo — o dropdown mostra o texto de cada modo, então não precisa
// de um ícone por modo pra comunicar o estado atual.

import { useState } from "react";
import { ArrowUpDown, Check } from "lucide-react";

import { BotaoIcone, Menu, ItemMenu, type PosicaoMenu } from "../index";
import { useVaultStore } from "../../estado/vaultStore";
import { ORDEM_MODOS, ROTULO_MODO, type ModoOrdenacao } from "../../vault/ordenacao";

export default function BotaoOrdenacao() {
  const modoOrdenacao = useVaultStore((s) => s.modoOrdenacao);
  const definirModoOrdenacao = useVaultStore((s) => s.definirModoOrdenacao);
  const [posicao, setPosicao] = useState<PosicaoMenu | null>(null);

  const selecionar = (modo: ModoOrdenacao) => {
    setPosicao(null);
    if (modo !== modoOrdenacao) void definirModoOrdenacao(modo);
  };

  return (
    <>
      <BotaoIcone
        Icone={ArrowUpDown}
        titulo={`Ordenar: ${ROTULO_MODO[modoOrdenacao]}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosicao({ x: rect.left, y: rect.bottom + 4 });
        }}
      />
      {posicao && (
        <Menu posicao={posicao} onFechar={() => setPosicao(null)}>
          {ORDEM_MODOS.map((modo) => (
            <ItemMenu
              key={modo}
              Icone={modo === modoOrdenacao ? Check : undefined}
              rotulo={ROTULO_MODO[modo]}
              onClick={() => selecionar(modo)}
            />
          ))}
        </Menu>
      )}
    </>
  );
}
