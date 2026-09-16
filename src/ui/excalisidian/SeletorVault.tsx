// Seletor de vault (doc 06, "Elemento de assinatura" > "Seletor de vault"; doc 12 §4.1-4.2).
// Substitui o Logotipo no cabeçalho da sidebar: o nome do vault é o próprio botão, ocupando o
// espaço flexível à esquerda. Abre um menu com os recentes, criar e abrir pasta.

import { useEffect, useRef, useState } from "react";
import { Check, FolderOpen, FolderPlus, X } from "lucide-react";
import { toast } from "sonner";

import { BotaoIcone, Menu, ItemMenu, SeparadorMenu, type PosicaoMenu } from "../index";
import { useVaultStore } from "../../estado/vaultStore";
import {
  listarRecentes,
  removerDosRecentes,
  nomeDoVault,
  mesmoVault,
  type VaultRecente,
} from "../../vault/vaultsRecentes";
import { abrirVaultEmJanela, escolherPasta } from "../../vault/janelas";
import DialogoCriarVault from "./DialogoCriarVault";

// Largura do fade no final do botão quando o nome transborda (doc 06: 24px, escolha do
// usuário em 16/09/2026, entre 16, 24 e 32 — a escala base de espaçamento).
const LARGURA_FADE = 24;

export default function SeletorVault() {
  const raiz = useVaultStore((s) => s.raiz);
  const nome = nomeDoVault(raiz);

  const textoRef = useRef<HTMLSpanElement | null>(null);
  const [transborda, setTransborda] = useState(false);

  // Mede o transbordo com ResizeObserver (nome do vault ou largura da sidebar podem mudar):
  // só aplica a máscara quando o texto realmente não cabe, nunca em nome curto (doc 12 §9).
  useEffect(() => {
    const el = textoRef.current;
    if (!el) return;
    const medir = () => setTransborda(el.scrollWidth > el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [nome]);

  const [menuAberto, setMenuAberto] = useState<PosicaoMenu | null>(null);
  const [recentes, setRecentes] = useState<VaultRecente[]>([]);
  const [dialogoCriarAberto, setDialogoCriarAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement | null>(null);

  async function abrirMenu() {
    setRecentes(await listarRecentes());
    const r = botaoRef.current?.getBoundingClientRect();
    setMenuAberto(r ? { x: r.left, y: r.bottom + 4 } : { x: 0, y: 0 });
  }

  async function abrirRecente(caminho: string) {
    setMenuAberto(null);
    const resultado = await abrirVaultEmJanela(caminho);
    if (resultado === "indisponivel") {
      toast("A pasta deste vault não foi encontrada.", {
        action: {
          label: "Remover da lista",
          onClick: () => void removerDosRecentes(caminho),
        },
      });
    }
  }

  async function removerRecente(caminho: string) {
    await removerDosRecentes(caminho);
    setRecentes(await listarRecentes());
  }

  async function abrirPastaComoVault() {
    setMenuAberto(null);
    const escolhido = await escolherPasta();
    if (!escolhido) return;
    const resultado = await abrirVaultEmJanela(escolhido);
    if (resultado === "indisponivel") {
      toast("A pasta deste vault não foi encontrada.", {
        action: {
          label: "Remover da lista",
          onClick: () => void removerDosRecentes(escolhido),
        },
      });
    }
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        title={raiz}
        onClick={() => void abrirMenu()}
        className="flex min-w-0 flex-1 items-center rounded-controle px-1.5 py-1 text-left text-pequeno text-tinta transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
      >
        <span
          ref={textoRef}
          className="block min-w-0 flex-1 overflow-hidden whitespace-nowrap"
          style={
            transborda
              ? {
                  maskImage: `linear-gradient(to right, #000 calc(100% - ${LARGURA_FADE}px), transparent)`,
                  WebkitMaskImage: `linear-gradient(to right, #000 calc(100% - ${LARGURA_FADE}px), transparent)`,
                }
              : undefined
          }
        >
          {nome}
        </span>
      </button>

      {menuAberto && (
        <Menu posicao={menuAberto} onFechar={() => setMenuAberto(null)}>
          {recentes.map((r) => {
            const atual = mesmoVault(r.caminho, raiz);
            return (
              <ItemLinhaRecente
                key={r.caminho}
                recente={r}
                atual={atual}
                onAbrir={() => void abrirRecente(r.caminho)}
                onRemover={() => void removerRecente(r.caminho)}
              />
            );
          })}
          <SeparadorMenu />
          <ItemMenu
            Icone={FolderPlus}
            rotulo="Criar vault…"
            onClick={() => {
              setMenuAberto(null);
              setDialogoCriarAberto(true);
            }}
          />
          <ItemMenu
            Icone={FolderOpen}
            rotulo="Abrir pasta como vault…"
            onClick={() => void abrirPastaComoVault()}
          />
        </Menu>
      )}

      {dialogoCriarAberto && (
        <DialogoCriarVault
          localPadrao={pastaPaiDe(raiz)}
          onFechar={() => setDialogoCriarAberto(false)}
          onCriado={(caminho) => {
            setDialogoCriarAberto(false);
            void abrirVaultEmJanela(caminho);
          }}
        />
      )}
    </>
  );
}

/** Pasta pai do vault atual, pra pré-preencher o "Local" do diálogo de criar (doc 12 §4.3). */
function pastaPaiDe(raiz: string): string {
  const semBarraFinal = raiz.replace(/[/\\]+$/, "");
  const i = Math.max(semBarraFinal.lastIndexOf("/"), semBarraFinal.lastIndexOf("\\"));
  return i === -1 ? "" : semBarraFinal.slice(0, i);
}

// Linha de recente com o "x" de remover que só aparece no hover (item que não é o atual).
// Composto aqui em vez de mudar ItemMenu — mantém os usos existentes de ItemMenu intactos.
function ItemLinhaRecente({
  recente,
  atual,
  onAbrir,
  onRemover,
}: {
  recente: VaultRecente;
  atual: boolean;
  onAbrir(): void;
  onRemover(): void;
}) {
  return (
    <div
      role="menuitem"
      title={recente.caminho}
      className="group flex w-full items-center gap-2 px-3 py-1.5 text-[13px] text-tinta transition-colors duration-[140ms] ease-caderno hover:bg-lavagem"
    >
      <button
        type="button"
        disabled={atual}
        onClick={onAbrir}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
      >
        {atual ? (
          <Check size={16} strokeWidth={1.5} className="shrink-0 text-tinta-media" aria-hidden />
        ) : (
          <span className="block w-4 shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">{nomeDoVault(recente.caminho)}</span>
      </button>
      {!atual && (
        <BotaoIcone
          Icone={X}
          titulo="Remover da lista"
          tamanho={16}
          className="shrink-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRemover();
          }}
        />
      )}
    </div>
  );
}
